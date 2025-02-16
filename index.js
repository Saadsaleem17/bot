const { makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qr = require('qrcode-terminal');
const cron = require('node-cron');

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth'); // Saves session
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true // Show QR in terminal
    });

    sock.ev.on('creds.update', saveCreds); // Save session so QR is not needed every time

    sock.ev.on("connection.update", ({ connection, lastDisconnect }) => {
        if (connection === "close") {
            const shouldReconnect = lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut;
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

    // Replace with your WhatsApp number (including country code, e.g., '919876543210@s.whatsapp.net')
    const yourNumber = process.env.YOUR_NUMBER;

    // Schedule reminders (format: 'minute hour day month day-of-week')
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
