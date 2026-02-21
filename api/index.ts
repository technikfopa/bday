import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { cors } from 'hono/cors'
import Redis from 'ioredis' // Používáme standardní Redis klient

// ─── Typy ────────────────────────────────────────────────────────────────────
type MessageColor = 'pink' | 'rose' | 'fuchsia' | 'purple' | 'gold'

interface Message {
  id: string
  name: string
  message: string
  color: MessageColor
  timestamp: number
}

// ─── Připojení k databázi ────────────────────────────────────────────────────

// Vercel načte proměnnou REDIS_URL, kterou jsme nastavili
// "family: 6" je hack, který někdy na Vercelu pomáhá s připojením, ale zkusíme to bez něj nebo s ním.
const connectionString = process.env.REDIS_URL
if (!connectionString) {
  throw new Error('Chybí environment variable REDIS_URL')
}

const redis = new Redis(connectionString)

const app = new Hono().basePath('/api')

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use('/*', cors())

const DB_KEY = 'birthday_messages'

// ─── API Endpointy ───────────────────────────────────────────────────────────

// GET /api/messages
app.get('/messages', async (c) => {
  try {
    // Standardní Redis vrací string (text), musíme ho převést na JSON
    const rawData = await redis.get(DB_KEY)
    
    // Pokud je databáze prázdná (null), vrátíme prázdné pole []
    const messages: Message[] = rawData ? JSON.parse(rawData) : []
    
    const sorted = messages.sort((a, b) => b.timestamp - a.timestamp)
    return c.json(sorted)
  } catch (error) {
    console.error('Chyba Redis:', error)
    return c.json({ error: 'Chyba databáze' }, 500)
  }
})

app.get('/test', (c) => {
  return c.text('Funguju!')
})

// POST /api/messages
app.post('/messages', async (c) => {
  try {
    const newMessage = await c.req.json<Message>()

    if (!newMessage.name || !newMessage.message) {
      return c.json({ error: 'Chybí jméno nebo zpráva' }, 400)
    }

    // 1. Načíst string z Redisu
    const rawData = await redis.get(DB_KEY)
    // 2. Převést na pole (nebo vytvořit nové, pokud nic není)
    const messages: Message[] = rawData ? JSON.parse(rawData) : []
    
    // 3. Přidat novou zprávu
    messages.push(newMessage)
    
    // 4. Uložit zpět jako string (Redis neumí JSON objekt)
    await redis.set(DB_KEY, JSON.stringify(messages))

    return c.json(newMessage, 201)
  } catch (error) {
    console.error('Chyba Redis:', error)
    return c.json({ error: 'Nepodařilo se uložit' }, 500)
  }
})

// DELETE /api/messages/:id
app.delete('/messages/:id', async (c) => {
  const id = c.req.param('id')
  
  const rawData = await redis.get(DB_KEY)
  if (!rawData) return c.json({ success: true })

  const messages: Message[] = JSON.parse(rawData)
  const newMessages = messages.filter((m) => m.id !== id)
  
  await redis.set(DB_KEY, JSON.stringify(newMessages))

  return c.json({ success: true })
})

export default handle(app)
