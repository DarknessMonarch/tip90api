const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const { protect } = require('../middleware/auth');
const {
  createBanner,
  getBanners,
  updateBanner,
  deleteBanner
} = require('../controllers/banner');

router.get('/', getBanners);

router.use(protect);
router.post('/', upload.array('bannerImage'), createBanner);
router.put('/:id', upload.array('bannerImage'), updateBanner);
router.delete('/:id', deleteBanner);

module.exports = router;