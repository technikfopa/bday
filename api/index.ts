import Redis from 'ioredis'
import express from 'express';
import cors from 'cors';

const connectionString = process.env.REDIS_URL

if (!connectionString) {
  throw new Error('CHYBA: Není nastavena REDIS_URL v env variables!')
}

const redis = new Redis(connectionString, {
  family: 4,             // Vynutí IPv4 (řeší timeouty na Vercelu)
  connectTimeout: 10000, // Timeout 10s
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false, 
})

redis.on('connect', () => console.log('Redis připojen!'))
redis.on('error', (err) => console.error('Chyba Redisu:', err))

type MessageColor = 'pink' | 'rose' | 'fuchsia' | 'purple' | 'gold'
interface Message {
  id: string
  name: string
  message: string
  color: MessageColor
  timestamp: number
}

const DB_KEY = 'birthday_messages'

const app = express();
app.use(cors({
  origin: ['https://stepamanarozky.vercel.app/', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Strip /api prefix if it exists (for Vercel)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    req.url = req.path.slice(4) || '/';
  }
  next();
});

app.get('/health', (req, res) => {
  return res.json({ status: 'ok', time: new Date().toISOString() })
})

app.get('/messages', async (req, res) => {
  try {
    const rawData = await redis.get(DB_KEY)
    const messages: Message[] = rawData ? JSON.parse(rawData) : []
    const sorted = messages.sort((a, b) => b.timestamp - a.timestamp)
    return res.json(sorted)
  } catch (error) {
    console.error('Chyba GET /messages:', error)
    return res.status(500).json({ error: 'Chyba databáze' })
  }
})

app.post('/messages', async (req, res) => {
  try {
    const newMessage = req.body as Message

    if (!newMessage.name || !newMessage.message) {
      return res.status(400).json({ error: 'Chybí data' })
    }

    const rawData = await redis.get(DB_KEY)
    const messages: Message[] = rawData ? JSON.parse(rawData) : []
    
    messages.push(newMessage)
    
    // Uložíme jako string
    await redis.set(DB_KEY, JSON.stringify(messages))

    return res.status(201).json(newMessage)
  } catch (error) {
    console.error('Chyba POST /messages:', error)
    return res.status(500).json({ error: 'Nepodařilo se uložit' })
  }
})

app.delete('/messages/:id', async (req, res) => {
  const id = req.params.id
  const rawData = await redis.get(DB_KEY)
  if (!rawData) return res.json({ success: true })

  const messages: Message[] = JSON.parse(rawData)
  const newMessages = messages.filter((m) => m.id !== id)
  
  await redis.set(DB_KEY, JSON.stringify(newMessages))
  return res.json({ success: true })
})

export default app;
export const handler = app;