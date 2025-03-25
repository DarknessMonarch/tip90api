const Payment = require('../models/payment');

exports.createPaymentPlan = async (req, res) => {
  try {
    const { country, currency, weekly, monthly } = req.body;

    const existingPlan = await Payment.findOne({ country });
    if (existingPlan) {
      return res.status(500).json({
        status: 'error',
        message: 'Payment plan for this country already exists'
      });
    }

    const paymentData = {
      country,
      currency,
      monthly: monthly || 0,
      weekly: weekly || 0
    };

    const paymentPlan = await Payment.create(paymentData);

    res.status(200).json({
      status: 'success',
      message: 'Payment plan created successfully',
      data: paymentPlan
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.updatePaymentPlan = async (req, res) => {
  try {
    const paymentPlan = await Payment.findById(req.params.id);
    if (!paymentPlan) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment plan not found'
      });
    }

    // Handle updates for both weekly and monthly prices
    const { weekly, monthly, ...otherData } = req.body;
    const updateData = {
      ...otherData,
      weekly: weekly !== undefined ? weekly : paymentPlan.weekly,
      monthly: monthly !== undefined ? monthly : paymentPlan.monthly
    };

    const updatedPlan = await Payment.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    res.status(200).json({
      status: 'success',
      message: 'Payment plan updated successfully',
      data: updatedPlan
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.getPaymentPlans = async (req, res) => {
  try {
    const paymentPlans = await Payment.find();
    res.status(200).json({
      status: 'success',
      message: 'Payment plans fetched successfully',
      data: paymentPlans
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.getPaymentPlanByCountry = async (req, res) => {
  try {
    const paymentPlan = await Payment.findOne({
      country: decodeURIComponent(req.params.country)
    });

    if (!paymentPlan) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment plan not found for this country'
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Payment plan fetched successfully',
      data: paymentPlan
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

exports.deletePaymentPlan = async (req, res) => {
  try {
    const paymentPlan = await Payment.findById(req.params.id);
    if (!paymentPlan) {
      return res.status(404).json({
        status: 'error',
        message: 'Payment plan not found'
      });
    }

    await Payment.findByIdAndDelete(req.params.id);
    res.status(200).json({
      status: 'success',
      message: 'Payment plan deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
};

module.exports = exports;