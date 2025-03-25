const Minio = require('minio');
const axios = require('axios');

class MinioService {
  constructor() {
    this.minioClient = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT,
      useSSL: true,
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    });
    this.bucketName = process.env.MINIO_BUCKET_NAME;
    this.init();
  }

  async init() {
    await this.ensureBucketExists();
  }

  async ensureBucketExists() {
    try {
      const exists = await this.minioClient.bucketExists(this.bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(this.bucketName, 'us-east-1');
        console.log(`Bucket ${this.bucketName} created successfully`);
      }
    } catch (err) {
      console.error('Error checking/creating bucket:', err);
    }
  }

  async uploadProfileImage(userId, imageBuffer) {
    const filename = `${userId}-${Date.now()}.jpg`;
    const objectName = `profile_images/${filename}`;
    
    await this.minioClient.putObject(this.bucketName, objectName, imageBuffer, {
      'Content-Type': 'image/jpeg',
    });
    
    return `https://${process.env.MINIO_ENDPOINT}/${this.bucketName}/${objectName}`;
  }

  async getDefaultProfileImage() {
    try {
      const defaultImageKey = '../profile/profile.jpg';
      
      let exists = false;
      try {
        await this.minioClient.statObject(this.bucketName, defaultImageKey);
        exists = true;
      } catch (err) {
        exists = false;
      }
      
      if (!exists) {
        const path = require('path');
        const fs = require('fs');
        const defaultImagePath = path.join(__dirname, '../profile/profile.jpg');
        
        const fileBuffer = fs.readFileSync(defaultImagePath);
        
        await this.minioClient.putObject(this.bucketName, defaultImageKey, fileBuffer, {
          'Content-Type': 'image/png'
        });
      }
      
      return this.getObjectUrl(defaultImageKey);
    } catch (error) {
      console.error('Error getting default profile image:', error);
      return `https://${process.env.MINIO_ENDPOINT}/${this.bucketName}/defaults/default-profile.png`;
    }
  }

  async removeProfileImage(imageUrl) {
    try {
      if (!imageUrl) return false;
      
      // If the URL is not from our MinIO server, don't attempt to remove it
      if (!this.isMinioUrl(imageUrl)) {
        return true; // Return true to indicate no error, but nothing was removed
      }
      
      const urlPath = new URL(imageUrl).pathname;
      const objectKey = urlPath.substring(urlPath.indexOf(this.bucketName) + this.bucketName.length + 1);
      
      await this.minioClient.removeObject(this.bucketName, objectKey);
      return true;
    } catch (error) {
      console.error('Error removing profile image:', error);
      return false;
    }
  }

  getObjectUrl(objectKey) {
    return `https://${process.env.MINIO_ENDPOINT}/${this.bucketName}/${objectKey}`;
  }

  getObjectKeyFromUrl(url) {
    if (!url) return null;
    
    try {
      // Check if the URL is from our MinIO server
      if (!this.isMinioUrl(url)) {
        return null;
      }
      
      const urlPath = new URL(url).pathname;
      return urlPath.substring(urlPath.indexOf(this.bucketName) + this.bucketName.length + 1);
    } catch (error) {
      console.error('Error parsing object URL:', error);
      return null;
    }
  }

  // Check if a URL is from our MinIO server
  isMinioUrl(url) {
    if (!url) return false;
    try {
      const urlObject = new URL(url);
      return urlObject.hostname === process.env.MINIO_ENDPOINT && 
             urlObject.pathname.includes(this.bucketName);
    } catch (error) {
      return false;
    }
  }

  async listObjects(prefix = '') {
    try {
      const objectsList = [];
      const stream = this.minioClient.listObjects(this.bucketName, prefix, true);
      
      return new Promise((resolve, reject) => {
        stream.on('data', (obj) => {
          objectsList.push(obj);
        });
        
        stream.on('error', (err) => {
          reject(err);
        });
        
        stream.on('end', () => {
          resolve(objectsList);
        });
      });
    } catch (error) {
      console.error('Error listing objects:', error);
      return [];
    }
  }

  async uploadFile(buffer, objectName, contentType) {
    try {
      await this.minioClient.putObject(this.bucketName, objectName, buffer, {
        'Content-Type': contentType,
      });
      
      return this.getObjectUrl(objectName);
    } catch (error) {
      console.error('Error uploading file:', error);
      throw error;
    }
  }
  
  async uploadBannerImage(buffer, filename) {
    try {
      const objectName = `banners/${Date.now()}-${filename}`;
      await this.minioClient.putObject(this.bucketName, objectName, buffer, {
        'Content-Type': 'image/jpeg',
        'x-amz-meta-usage': 'banner',
      });
      
      return this.getObjectUrl(objectName);
    } catch (error) {
      console.error('Error uploading banner image:', error);
      throw error;
    }
  }

  // Handle either a file buffer or an image URL
  async uploadPredictionImage(input, filename, imageType) {
    try {
      // If input is a string, it's already a URL
      if (typeof input === 'string') {
        // Just return the URL as is
        return input;
      }

      // If it's a Buffer, upload it to MinIO
      const objectName = `predictions/${imageType}/${Date.now()}-${filename}`;
      
      await this.minioClient.putObject(this.bucketName, objectName, input, {
        'Content-Type': 'image/jpeg',
        'x-amz-meta-usage': 'prediction',
        'x-amz-meta-type': imageType,
      });
      
      return this.getObjectUrl(objectName);
    } catch (error) {
      console.error(`Error uploading prediction ${imageType} image:`, error);
      throw error;
    }
  }

  async downloadAndUploadImage(imageUrl, imageType) {
    try {
      if (this.isMinioUrl(imageUrl)) {
        return imageUrl;
      }
      
      const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(response.data);
      
      const urlParts = imageUrl.split('/');
      const originalFilename = urlParts[urlParts.length - 1];
      const filename = originalFilename.split('?')[0]; 
      
      return await this.uploadPredictionImage(buffer, filename, imageType);
    } catch (error) {
      console.error(`Error downloading and uploading image from URL:`, error);
      return imageUrl;
    }
  }

  getFileStream(objectName) {
    return this.minioClient.getObject(this.bucketName, objectName);
  }
}

const minioService = new MinioService();
module.exports = minioService;