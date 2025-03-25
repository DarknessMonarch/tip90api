const Banner = require('../models/banner');
const minioService = require('../config/minio');
const fs = require('fs');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);

exports.createBanner = async (req, res) => {
  try {
    if (!req.files || !req.files.length) {
      return res.status(400).json({ message: 'Banner images are required' });
    }

    const bannerUrls = await Promise.all(
      req.files.map(async (file) => {
        const buffer = await readFileAsync(file.path);
        // Upload to MinIO as banner image
        return minioService.uploadBannerImage(buffer, file.originalname);
      })
    );

    const banner = await Banner.create({
      bannerImage: bannerUrls
    });

    // Clean up temp files after upload
    req.files.forEach(file => {
      fs.unlink(file.path, (err) => {
        if (err) console.error(`Failed to delete temp file: ${file.path}`, err);
      });
    });

    res.status(201).json(banner);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({ isActive: true });
    res.status(200).json(banners);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    let bannerUrls = [...banner.bannerImage];

    if (req.files && req.files.length) {
      const newUrls = await Promise.all(
        req.files.map(async (file) => {
          // Read file as buffer
          const buffer = await readFileAsync(file.path);
          // Upload to MinIO as banner image
          return minioService.uploadBannerImage(buffer, file.originalname);
        })
      );
      bannerUrls = [...bannerUrls, ...newUrls];
      
      // Clean up temp files after upload
      req.files.forEach(file => {
        fs.unlink(file.path, (err) => {
          if (err) console.error(`Failed to delete temp file: ${file.path}`, err);
        });
      });
    }

    const updatedBanner = await Banner.findByIdAndUpdate(
      req.params.id,
      { 
        bannerImage: bannerUrls,
        isActive: req.body.isActive !== undefined ? req.body.isActive : banner.isActive
      },
      { new: true }
    );

    res.status(200).json(updatedBanner);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteBanner = async (req, res) => {
  try {
    const banner = await Banner.findById(req.params.id);
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    // Delete images from MinIO
    await Promise.all(
      banner.bannerImage.map(async (url) => {
        await minioService.removeProfileImage(url);
      })
    );

    await Banner.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Banner deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a specific banner image
exports.deleteBannerImage = async (req, res) => {
  try {
    const { id, imageUrl } = req.params;
    
    if (!id || !imageUrl) {
      return res.status(400).json({ message: 'Banner ID and image URL are required' });
    }
    
    const banner = await Banner.findById(id);
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }
    
    // Check if image exists in banner
    if (!banner.bannerImage.includes(imageUrl)) {
      return res.status(404).json({ message: 'Image not found in this banner' });
    }
    
    // Remove image from MinIO
    await minioService.removeProfileImage(imageUrl);
    
    // Update banner document
    const updatedBannerImages = banner.bannerImage.filter(url => url !== imageUrl);
    
    await Banner.findByIdAndUpdate(id, { bannerImage: updatedBannerImages });
    
    res.status(200).json({ message: 'Banner image deleted successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

module.exports = exports;