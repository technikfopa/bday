import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { cors } from 'hono/cors'
import { kv } from '@vercel/kv'

// ─── Typy (zkopírované z frontendu pro jistotu) ──────────────────────────────
type MessageColor = 'pink' | 'rose' | 'fuchsia' | 'purple' | 'gold'

interface Message {
  id: string
  name: string
  message: string
  color: MessageColor
  timestamp: number
}

// ─── Nastavení aplikace ──────────────────────────────────────────────────────

const app = new Hono().basePath('/api')

// Povolit CORS (aby frontend mohl mluvit s backendem)
app.use('/*', cors())

const DB_KEY = 'birthday_messages_v1'

// ─── API Endpointy ───────────────────────────────────────────────────────────

// 1. Získat všechny zprávy
app.get('/messages', async (c) => {
  try {
    // Stáhneme data z Vercel KV databáze
    const messages = await kv.get<Message[]>(DB_KEY) || []
    
    // Seřadíme od nejnovější
    const sorted = messages.sort((a, b) => b.timestamp - a.timestamp)
    return c.json(sorted)
  } catch (error) {
    return c.json({ error: 'Chyba databáze' }, 500)
  }
})

// 2. Odeslat novou zprávu
app.post('/messages', async (c) => {
  try {
    const newMessage = await c.req.json<Message>()

    // Validace
    if (!newMessage.name || !newMessage.message) {
      return c.json({ error: 'Chybí jméno nebo text' }, 400)
    }

    // Atomická operace: Načíst -> Přidat -> Uložit
    const messages = await kv.get<Message[]>(DB_KEY) || []
    messages.push(newMessage)
    await kv.set(DB_KEY, messages)

    return c.json(newMessage, 201)
  } catch (error) {
    console.error(error)
    return c.json({ error: 'Nepodařilo se uložit' }, 500)
  }
})

// 3. Smazat zprávu (podle ID)
app.delete('/messages/:id', async (c) => {
  const id = c.req.param('id')
  
  const messages = await kv.get<Message[]>(DB_KEY) || []
  const filtered = messages.filter((m) => m.id !== id)
  
  await kv.set(DB_KEY, filtered)
  
  return c.json({ success: true })
})

// Důležité: Export pro Vercel
export default handle(app)