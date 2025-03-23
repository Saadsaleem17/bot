import { makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason, makeInMemoryStore } from '@whiskeysockets/baileys';
import qr from 'qrcode-terminal';
import cron from 'node-cron';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Image } from './models/Image.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create uploads directory if it doesn't exist
const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    dbName: 'whatsapp_images',  // Explicitly set the database name
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => {
        console.log('Connected to MongoDB');
        console.log('Database URL:', process.env.MONGODB_URI);
        console.log('Database Name:', mongoose.connection.db.databaseName);
        // List all collections in the database
        mongoose.connection.db.listCollections().toArray((err, collections) => {
            if (err) {
                console.error('Error listing collections:', err);
            } else {
                console.log('Collections in database:', collections.map(c => c.name));
            }
        });
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        console.error('Connection string:', process.env.MONGODB_URI);
    });

// Create a store for the WhatsApp session
const store = makeInMemoryStore({});

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Chrome (Linux)', '', '']
    });

    // Bind store to the socket
    store.bind(sock.ev);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "close") {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log("Reconnecting...");
                connectToWhatsApp();
            } else {
                console.log("Logged out. Scan QR again.");
            }
        } else if (connection === "open") {
            console.log("✅ Connected to WhatsApp!");
        }
    });

    // Handle incoming messages
    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const messageType = Object.keys(m.message)[0];
        const messageContent = m.message[messageType];

        // Handle image messages
        if (messageType === 'imageMessage') {
            try {
                const buffer = await downloadMediaMessage(m, 'buffer');
                const contentType = messageContent.mimetype || 'image/jpeg';

                // Create image record in database
                const image = new Image({
                    messageId: m.key.id,
                    sender: m.key.remoteJid,
                    imageData: buffer,
                    contentType: contentType,
                    caption: messageContent.caption || ''
                });

                console.log('Attempting to save image to database:', {
                    messageId: m.key.id,
                    sender: m.key.remoteJid,
                    contentType: contentType
                });

                await image.save();
                console.log('✅ Image saved to database successfully');
                console.log('Database:', mongoose.connection.db.databaseName);
                console.log('Collection: images');
            } catch (error) {
                console.error('Error processing image:', error);
                await sock.sendMessage(m.key.remoteJid, {
                    text: '❌ Error processing image. Please try again.'
                });
            }
        }
    });

    const yourNumber = process.env.YOUR_NUMBER;

    // Schedule reminders
    cron.schedule('0 9 * * *', () => {
        sendReminder(sock, yourNumber, "🌞 Good morning! Don't forget to plan your tasks for today!");
    });

    cron.schedule('0 14 * * *', () => {
        sendReminder(sock, yourNumber, "🚀 Reminder: Stay focused and finish your work on time!");
    });

    cron.schedule('0 20 * * *', () => {
        sendReminder(sock, yourNumber, "🌙 Night check-in: Did you commit to github? Plan for tomorrow!");
    });

    cron.schedule('20 0 * * *', () => {
        sendReminder(sock, yourNumber, "🌙 Night check-in: Did you commit to github? Plan for tomorrow!");
    });

    async function sendReminder(sock, to, message) {
        await sock.sendMessage(to, { text: message });
        console.log(`✅ Reminder sent to ${to}: ${message}`);
    }

    return sock;
}

connectToWhatsApp();
