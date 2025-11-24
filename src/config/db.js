const mongoose = require('mongoose');

module.exports = function connectDB() {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/parcel-distribution';
  mongoose.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
      console.error('MongoDB connection error', err);
      process.exit(1);
    });
};
