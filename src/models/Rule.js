const mongoose = require('mongoose');

/*
  Basic Rule document structure.
  type: 'weight'|'value'|custom
  config: an object (for weight -> buckets)
*/
const ruleSchema = new mongoose.Schema({
  name: String,
  type: String,
  priority: { type: Number, default: 10 },
  config: { type: mongoose.Schema.Types.Mixed },
  version: { type: String, default: '1.0' }
}, { timestamps: true });

module.exports = mongoose.model('Rule', ruleSchema);
