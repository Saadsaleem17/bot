# WhatsApp Image Storage Bot

A WhatsApp bot that receives images and stores them in MongoDB. The bot also provides a web interface to view and download the stored images.

## Features
- Receives images via WhatsApp
- Stores images in MongoDB
- Web interface to view and download images
- Automatic reconnection handling
- Daily reminders

## Prerequisites
- Node.js >= 18.0.0
- MongoDB Atlas account
- WhatsApp account
- DigitalOcean account (for deployment)

## Environment Variables
Create a `.env` file with the following variables:
```
YOUR_NUMBER=your_whatsapp_number@s.whatsapp.net
MONGODB_URI=your_mongodb_connection_string
```

## Local Development
1. Install dependencies:
```bash
npm install
```

2. Start the WhatsApp bot:
```bash
npm run start
```

3. Start the image viewer (in a separate terminal):
```bash
npm run view
```

4. Open http://localhost:3000 to view images

## Deployment on DigitalOcean
This project is configured for deployment on DigitalOcean App Platform:

1. Push your code to GitHub
2. Go to [DigitalOcean App Platform](https://cloud.digitalocean.com/apps)
3. Click "Create App"
4. Connect your GitHub repository
5. Configure the app:
   - Environment: Node.js
   - Build Command: `npm install`
   - Run Command: `npm start`
   - Environment Variables:
     - YOUR_NUMBER
     - MONGODB_URI
6. Choose the free tier plan
7. Deploy!

## Benefits of DigitalOcean App Platform
- Free tier available
- Automatic HTTPS
- Built-in monitoring
- Easy scaling
- Automatic deployments from GitHub

## License
MIT
