const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const { protect, authenticateVip, authenticateAdmin } = require('../middleware/auth');
const { createPrediction, getPredictions, getSinglePrediction, updatePrediction, deletePrediction } = require('../controllers/prediction');

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF)$/)) {
    req.fileValidationError = 'Only image files are allowed!';
    return cb(new Error('Only image files are allowed!'), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
}).fields([
  { name: 'leagueImage', maxCount: 1 },
  { name: 'teamAImage', maxCount: 1 },
  { name: 'teamBImage', maxCount: 1 }
]);

const handleMulterError = (error, req, res, next) => {
  console.error('Multer error:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File size too large. Maximum size is 20MB'
      });
    }
    return res.status(400).json({
      success: false,
      message: `File upload error: ${error.message}`
    });
  }
  if (error) {
    return res.status(400).json({
      success: false,
      message: `Upload error: ${error.message}`
    });
  }
  next();
};

// Public routes with potential VIP authentication
router.get('/:category/:date', (req, res, next) => {
  if (req.params.category === 'vip') {
    protect(req, res, () => {
      authenticateVip(req, res, next);
    });
  } else {
    next();
  }
}, getPredictions);

router.get(
  '/:category/:teamA/:teamB/:date',
  (req, res, next) => {
    if (req.params.category === 'vip') {
      return protect(req, res, () => {
        authenticateVip(req, res, next);
      });
    }
    next();
  },
  getSinglePrediction 
);

// Admin-only routes
router.use(protect, authenticateAdmin);

router.post('/', (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      return handleMulterError(err, req, res, next);
    }
    next();
  });
}, createPrediction);

router.put('/:id', (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      return handleMulterError(err, req, res, next);
    }
    next();
  });
}, updatePrediction);

router.delete('/:id', deletePrediction);

module.exports = router;