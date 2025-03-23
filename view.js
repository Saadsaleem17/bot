import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Image } from './models/Image.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import cors from 'cors';
import helmet from 'helmet';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    dbName: 'whatsapp_images',
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Route to serve image data
app.get('/image/:id', async (req, res) => {
    try {
        const image = await Image.findById(req.params.id);
        if (!image) {
            return res.status(404).send('Image not found');
        }
        res.set('Content-Type', image.contentType);
        res.send(image.imageData);
    } catch (error) {
        console.error('Error serving image:', error);
        res.status(500).send('Error serving image');
    }
});

// Route to display all images
app.get('/', async (req, res) => {
    try {
        const images = await Image.find().sort({ timestamp: -1 });
        res.send(`
            <html>
                <head>
                    <title>WhatsApp Images</title>
                    <style>
                        body { font-family: Arial, sans-serif; margin: 20px; }
                        .image-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
                        .image-card { border: 1px solid #ddd; padding: 10px; border-radius: 8px; }
                        .image-card img { width: 100%; height: 300px; object-fit: cover; border-radius: 4px; }
                        .image-info { margin-top: 10px; }
                        .timestamp { color: #666; font-size: 0.9em; }
                        .download-btn { 
                            display: inline-block; 
                            padding: 8px 16px; 
                            background: #4CAF50; 
                            color: white; 
                            text-decoration: none; 
                            border-radius: 4px;
                            margin-top: 10px;
                        }
                        .download-btn:hover { background: #45a049; }
                    </style>
                </head>
                <body>
                    <h1>WhatsApp Images</h1>
                    <div class="image-grid">
                        ${images.map(image => `
                            <div class="image-card">
                                <img src="/image/${image._id}" alt="WhatsApp Image">
                                <div class="image-info">
                                    <p><strong>Sender:</strong> ${image.sender}</p>
                                    <p><strong>Caption:</strong> ${image.caption || 'No caption'}</p>
                                    <p class="timestamp"><strong>Date:</strong> ${new Date(image.timestamp).toLocaleString()}</p>
                                    <a href="/image/${image._id}" download="whatsapp-image-${image._id}.jpg" class="download-btn">Download Image</a>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </body>
            </html>
        `);
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).send('Error fetching images');
    }
});

app.listen(port, () => {
    console.log(`View your images at http://localhost:${port}`);
}); 