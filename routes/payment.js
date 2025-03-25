const express = require('express');
const router = express.Router();
const { protect, authenticateAdmin } = require('../middleware/auth');
const {
  createPaymentPlan,
  getPaymentPlans,
  getPaymentPlanByCountry,
  updatePaymentPlan,
  deletePaymentPlan
} = require('../controllers/payment');

router.get('/', getPaymentPlans);
router.get('/:country', getPaymentPlanByCountry);


router.use(protect, authenticateAdmin);
router.post('/', createPaymentPlan);
router.put('/:id', updatePaymentPlan);
router.delete('/:id', deletePaymentPlan);

module.exports = router;