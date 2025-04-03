import { makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason, makeInMemoryStore } from '@whiskeysockets/baileys';
import qr from 'qrcode-terminal';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Image } from './models/Image.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

// MongoDB connection with retry logic and detailed logging
let isConnected = false;
let connectionPromise = null;
let connectionAttempts = 0;
const MAX_RETRIES = 3;

const connectDB = async () => {
    if (isConnected) {
        console.log('Using existing MongoDB connection');
        return true;
    }
    
    if (connectionPromise) {
        console.log('Connection attempt in progress, waiting...');
        return connectionPromise;
    }
    
    connectionAttempts++;
    console.log(`Attempting MongoDB connection (attempt ${connectionAttempts}/${MAX_RETRIES})...`);
    
    try {
        connectionPromise = mongoose.connect(process.env.MONGODB_URI, {
            dbName: 'whatsapp_images',
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 60000,
            connectTimeoutMS: 30000,
            maxPoolSize: 10,
            minPoolSize: 5,
            ssl: true,
            tls: true,
            tlsAllowInvalidCertificates: true,
            tlsAllowInvalidHostnames: true,
            retryWrites: true,
            w: 'majority',
            retryReads: true,
            autoIndex: false,
            maxIdleTimeMS: 60000,
            heartbeatFrequencyMS: 10000,
            family: 4
        }).then(() => {
            isConnected = true;
            console.log('Successfully connected to MongoDB');
            return true;
        }).catch(error => {
            console.error('MongoDB connection error:', {
                message: error.message,
                code: error.code,
                name: error.name,
                stack: error.stack
            });
            isConnected = false;
            connectionPromise = null;
            
            if (connectionAttempts < MAX_RETRIES) {
                console.log(`Retrying connection in 2 seconds...`);
                setTimeout(() => {
                    connectDB();
                }, 2000);
            }
            
            throw error;
        });

        return connectionPromise;
    } catch (error) {
        console.error('Connection setup error:', {
            message: error.message,
            code: error.code,
            name: error.name,
            stack: error.stack
        });
        throw error;
    }
};

// Initialize MongoDB connection
connectDB().catch(err => {
    console.error('Failed to connect to MongoDB:', err);
    process.exit(1);
});

const store = makeInMemoryStore({});

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Chrome (Linux)', '', '']
    });

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

    sock.ev.on('messages.upsert', async ({ messages }) => {
        const m = messages[0];
        if (!m.message) return;

        const messageType = Object.keys(m.message)[0];
        const messageContent = m.message[messageType];

        if (messageType === 'imageMessage') {
            try {
                const buffer = await downloadMediaMessage(m, 'buffer');
                const contentType = messageContent.mimetype || 'image/jpeg';

                console.log('Image details:', {
                    messageId: m.key.id,
                    sender: m.key.remoteJid,
                    contentType: contentType,
                    bufferSize: buffer.length,
                    isBuffer: Buffer.isBuffer(buffer)
                });

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
                    contentType: contentType,
                    imageDataSize: image.imageData.length,
                    isBuffer: Buffer.isBuffer(image.imageData)
                });

                await image.save();
                console.log('✅ Image saved to database successfully');
                console.log('Database:', mongoose.connection.db.databaseName);
                console.log('Collection: images');
                console.log('Image ID:', image._id);
            } catch (error) {
                console.error('Error processing image:', {
                    message: error.message,
                    stack: error.stack,
                    error: error
                });
                await sock.sendMessage(m.key.remoteJid, {
                    text: '❌ Error processing image. Please try again.'
                });
            }
        }
    });

    const yourNumber = process.env.YOUR_NUMBER;

    return sock;
}

connectToWhatsApp();
