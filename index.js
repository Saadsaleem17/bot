import { makeWASocket, useMultiFileAuthState, downloadMediaMessage, DisconnectReason, makeInMemoryStore } from '@whiskeysockets/baileys';
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
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000
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
    // Create auth directory if it doesn't exist
    if (!fs.existsSync('./auth')) {
        console.log('Creating auth directory...');
        fs.mkdirSync('./auth');
    }
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    
    // Create socket with fixed version and stable configuration
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true,
        browser: ['Chrome', 'Desktop', '10.0'],
        version: [2, 2306, 7],
        connectTimeoutMs: 60000,
        keepAliveIntervalMs: 25000,
        emitOwnEvents: false,
        syncFullHistory: false,
        retryRequestDelayMs: 1000
    });

    store.bind(sock.ev);

    // Save credentials whenever they are updated
    sock.ev.on('creds.update', saveCreds);
    
    // Keep track of reconnection attempts
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 5;
    
    sock.ev.on("connection.update", (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('\n\n┌─QR Code received, please scan with WhatsApp mobile app─────────┐');
            console.log('│                                                               │');
            console.log('│   The QR code is displayed in the terminal. If you cannot     │');
            console.log('│   see it, try using a different terminal or increasing the    │');
            console.log('│   terminal window size.                                       │');
            console.log('│                                                               │');
            console.log('└───────────────────────────────────────────────────────────────┘\n\n');
        }

        if (connection === "close") {
            const statusCode = lastDisconnect?.error?.output?.statusCode;
            const reason = lastDisconnect?.error?.output?.payload?.error;
            console.log(`Connection closed. Status: ${statusCode}, Reason: ${reason}`);
            
            // Handle specific error codes differently
            if (statusCode === 515) {
                reconnectAttempts++;
                const delay = Math.min(reconnectAttempts * 10000, 60000); // Exponential backoff
                
                if (reconnectAttempts <= maxReconnectAttempts) {
                    console.log(`Connection rate limited (515). Waiting ${delay/1000}s before attempt ${reconnectAttempts}/${maxReconnectAttempts}...`);
                    setTimeout(connectToWhatsApp, delay);
                } else {
                    console.log("Maximum reconnection attempts reached. Please restart the bot manually after waiting for at least 10 minutes.");
                    process.exit(1);
                }
            } else if (statusCode === DisconnectReason.loggedOut) {
                // If logged out, clear the auth state and restart
                console.log("Logged out from WhatsApp. Clearing auth state...");
                fs.rmSync('./auth', { recursive: true, force: true });
                fs.mkdirSync('./auth');
                console.log("Please restart the bot and scan the QR code again.");
                process.exit(1);
            } else {
                // General reconnection for other errors
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                if (shouldReconnect) {
                    console.log("Reconnecting due to connection error...");
                    setTimeout(connectToWhatsApp, 5000);
                }
            }
        } else if (connection === "open") {
            // Reset reconnect counter on successful connection
            reconnectAttempts = 0;
            console.log("\n✅ CONNECTED TO WHATSAPP!\n");
            console.log("Bot is now ready to receive messages.");
        }
    });

    sock.ev.on("messages.upsert", async ({ messages }) => {
        const msg = messages[0];
        if (!msg.message) return; // Ignore empty messages

        try {
            console.log("Received message:", {
                from: msg.key.remoteJid,
                type: Object.keys(msg.message)[0],
                timestamp: new Date(msg.messageTimestamp * 1000).toISOString()
            });

            const messageType = Object.keys(msg.message)[0];
            console.log("Message type:", messageType);

            // Handle different message types
            switch (messageType) {
                case "conversation":
                case "extendedTextMessage":
                    console.log("Processing text message...");
                    // Your text message processing logic here
                    break;

                case "imageMessage":
                    console.log("Processing image message...");
                    try {
                        // Log the full message object for debugging
                        console.log("Full image message:", JSON.stringify(msg.message[messageType], null, 2));
                        
                        // Download the image
                        console.log("Downloading image...");
                        const buffer = await downloadMediaMessage(msg, 'buffer');
                        console.log("Image downloaded successfully, size:", buffer.length);
                        
                        const contentType = msg.message[messageType].mimetype || 'image/jpeg';
                        console.log("Content type:", contentType);

                        // Create image document
                        const image = new Image({
                            messageId: msg.key.id,
                            sender: msg.key.remoteJid,
                            imageData: buffer,
                            contentType: contentType,
                            caption: msg.message[messageType].caption || ''
                        });

                        // Log before saving
                        console.log('Saving image to database:', {
                            messageId: image.messageId,
                            sender: image.sender,
                            contentType: image.contentType,
                            dataSize: image.imageData.length
                        });

                        // Save to database
                        await image.save();
                        console.log('✅ Image saved successfully to database');

                        // Remove success message
                    } catch (error) {
                        console.error('Error processing image:', {
                            message: error.message,
                            stack: error.stack,
                            error: error
                        });
                        // Remove error message
                    }
                    break;

                case "videoMessage":
                    console.log("Processing video message...");
                    // Your video processing logic here
                    break;

                case "audioMessage":
                    console.log("Processing audio message...");
                    // Your audio processing logic here
                    break;

                case "documentMessage":
                    console.log("Processing document message...");
                    // Your document processing logic here
                    break;

                default:
                    console.warn(`Unknown message type: ${messageType}, ignoring...`);
                    console.log("Full message object:", JSON.stringify(msg, null, 2));
                    break;
            }
        } catch (err) {
            console.error("Error processing message:", {
                error: err.message,
                stack: err.stack,
                message: msg
            });
        }
    });

    const yourNumber = process.env.YOUR_NUMBER;

    return sock;
}

connectToWhatsApp();
