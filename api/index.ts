import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { cors } from 'hono/cors'
import Redis from 'ioredis'

// ─── 1. Inicializace Redisu ──────────────────────────────────────────────────

const connectionString = process.env.REDIS_URL

if (!connectionString) {
  throw new Error('CHYBA: Není nastavena REDIS_URL v env variables!')
}

// Inicializace klienta mimo handler (aby se připojil jen jednou)
const redis = new Redis(connectionString, {
  family: 4,             // Vynutí IPv4 (řeší timeouty na Vercelu)
  connectTimeout: 10000, // Timeout 10s
  maxRetriesPerRequest: 1,
  // DŮLEŽITÉ: Toto říká ioredisu, aby nedržel proces naživu, pokud není aktivní
  enableOfflineQueue: false, 
})

// Rychlý test spojení do logu (uvidíš ve Vercel Logs)
redis.on('connect', () => console.log('Redis připojen!'))
redis.on('error', (err) => console.error('Chyba Redisu:', err))

// ─── 2. Hono Aplikace ────────────────────────────────────────────────────────

const app = new Hono().basePath('/api')

// Povolit CORS pro všechny
app.use('/*', cors())

// Typy
type MessageColor = 'pink' | 'rose' | 'fuchsia' | 'purple' | 'gold'
interface Message {
  id: string
  name: string
  message: string
  color: MessageColor
  timestamp: number
}

const DB_KEY = 'birthday_messages'

// ─── 3. Endpointy ────────────────────────────────────────────────────────────

// Jednoduchý testovací endpoint - pokud funguje tento, Hono běží správně
app.get('/health', (c) => {
  return c.json({ status: 'ok', time: new Date().toISOString() })
})

app.get('/messages', async (c) => {
  try {
    const rawData = await redis.get(DB_KEY)
    const messages: Message[] = rawData ? JSON.parse(rawData) : []
    const sorted = messages.sort((a, b) => b.timestamp - a.timestamp)
    return c.json(sorted)
  } catch (error) {
    console.error('Chyba GET /messages:', error)
    return c.json({ error: 'Chyba databáze' }, 500)
  }
})

app.post('/messages', async (c) => {
  try {
    const newMessage = await c.req.json<Message>()

    if (!newMessage.name || !newMessage.message) {
      return c.json({ error: 'Chybí data' }, 400)
    }

    const rawData = await redis.get(DB_KEY)
    const messages: Message[] = rawData ? JSON.parse(rawData) : []
    
    messages.push(newMessage)
    
    // Uložíme jako string
    await redis.set(DB_KEY, JSON.stringify(messages))

    return c.json(newMessage, 201)
  } catch (error) {
    console.error('Chyba POST /messages:', error)
    return c.json({ error: 'Nepodařilo se uložit' }, 500)
  }
})

app.delete('/messages/:id', async (c) => {
  const id = c.req.param('id')
  const rawData = await redis.get(DB_KEY)
  if (!rawData) return c.json({ success: true })

  const messages: Message[] = JSON.parse(rawData)
  const newMessages = messages.filter((m) => m.id !== id)
  
  await redis.set(DB_KEY, JSON.stringify(newMessages))
  return c.json({ success: true })
})

// ─── 4. Export pro Vercel (TOHLE JE KRITICKÉ) ────────────────────────────────

// ŽÁDNÉ `serve(...)` nebo `app.listen(...)` zde nesmí být!
export default handle(app)