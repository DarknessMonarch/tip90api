const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
  formationA: {
    type: [String],
    required: true,
    validate: {
      validator: (arr) => arr.length === 5,
      message: 'Formation A must contain exactly 5 recent results'
    }
  },
  formationB: {
    type: [String],
    required: true,
    validate: {
      validator: (arr) => arr.length === 5,
      message: 'Formation B must contain exactly 5 recent results'
    }
  },
  leagueImage: {
    type: String,
    required: true
  },
  teamAImage: {
    type: String,
    required: true
  },
  teamBImage: {
    type: String,
    required: true
  },
  tip: {
    type: String,
    required: true
  },
  league: {
    type: String,
    required: true
  },
  teamA: {
    type: String,
    required: true
  },
  teamB: {
    type: String,
    required: true
  },
  country: {
    type: String,
    required: true
  },
  teamAscore: {
    type: Number,
    required: true
  },
  teamBscore: {
    type: Number,
    required: true
  },
  category: {
    type: String,
    required: true,
    enum: ["banker", "straight", "vip", "winning", "basketball"]
  },
  sport: {
    type: String,
    required: true,
  },
  time: {
    type: Date,
    required: true
  },
  status: {
    type: String,
    default: ''
  },
  showScore: {
    type: Boolean,
    default: false
  },
  showBtn: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

const Prediction = mongoose.model('Prediction', predictionSchema);

module.exports = Prediction;