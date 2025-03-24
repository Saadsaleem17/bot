import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import { Image } from './models/Image.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB Connection
const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB Connected:', conn.connection.host);
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
};

// Connect to MongoDB
connectDB();

// Route to serve image data
app.get('/api/image/:id', async (req, res) => {
    try {
        console.log('Fetching image with ID:', req.params.id);
        
        const image = await Image.findById(req.params.id);
        if (!image) {
            console.log('Image not found:', req.params.id);
            return res.status(404).send('Image not found');
        }

        console.log('Image details:', {
            id: image._id,
            sender: image.sender,
            timestamp: image.timestamp,
            contentType: image.contentType,
            dataSize: image.imageData.length,
            isBuffer: Buffer.isBuffer(image.imageData)
        });

        res.set({
            'Content-Type': image.contentType,
            'Content-Length': image.imageData.length,
            'Cache-Control': 'public, max-age=31536000'
        });

        res.send(image.imageData);
    } catch (error) {
        console.error('Error serving image:', error);
        res.status(500).send('Error serving image');
    }
});

// Route to display all images with pagination
app.get('/api/images', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 12;
        const skip = (page - 1) * limit;

        console.log('Fetching images with params:', { page, limit, skip });

        // Get total count first
        const totalCount = await Image.countDocuments();
        console.log('Total images in database:', totalCount);

        // Get paginated images
        const images = await Image.find()
            .sort({ timestamp: -1 })
            .skip(skip)
            .limit(limit)
            .select('-imageData'); // Exclude image data from the response

        console.log('Found images for current page:', images.length);

        // Return both images and pagination info
        res.json({
            images,
            pagination: {
                total: totalCount,
                page,
                limit,
                totalPages: Math.ceil(totalCount / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ error: 'Error fetching images' });
    }
});

// Serve the main HTML file
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 