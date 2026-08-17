/**
 * Local Semantic Search Engine using Hugging Face all-MiniLM-L6-v2
 * Provides neural embedding similarity & contextual matching across company names,
 * industries, operational friction, and tech stacks without literal keyword constraints.
 */

let extractor = null;
const leadVectorCache = new Map();

async function getExtractor() {
  if (!extractor) {
    try {
      const { pipeline } = await import('@xenova/transformers');
      extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
        quantized: true
      });
    } catch (err) {
      console.warn('Failed to load Xenova pipeline, falling back to taxonomy matcher:', err.message);
      return null;
    }
  }
  return extractor;
}

function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

function buildLeadContext(lead) {
  const parts = [
    lead.name || '',
    lead.industry || '',
    lead.location || '',
    (lead.tech_stack || []).join(' '),
    lead.category === 'BPO_RESCUE' ? 'Odoo ERP BPO Support maintenance upgrade' : 'New Implementation modernization',
    lead.battlecard && lead.battlecard.problem_analysis ? lead.battlecard.problem_analysis.join(' ') : ''
  ];
  return parts.filter(Boolean).join(' - ');
}

async function computeEmbedding(text) {
  const model = await getExtractor();
  if (!model) return null;
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// Fallback semantic synonym & taxonomy resolver if model is warming up
const INDUSTRY_TAXONOMY = {
  'construction': ['builder', 'contractor', 'roofing', 'carpentry', 'masonry', 'plumbing', 'electric', 'hvac', 'renovation', 'framing', 'demolition', 'civil', 'drywall', 'general contractor', 'commercial construction'],
  'contractor': ['construction', 'builder', 'roofing', 'plumbing', 'electric', 'hvac', 'field services'],
  'medical': ['healthcare', 'clinic', 'dental', 'doctor', 'physician', 'hospital', 'diagnostics', 'pharma', 'surgery', 'patient', 'health'],
  'healthcare': ['medical', 'clinic', 'dental', 'diagnostics', 'doctor', 'hospital'],
  'plumbing': ['drain', 'pipe', 'water heater', 'contractor', 'sewer', 'field services', 'construction'],
  'roofing': ['roof', 'commercial roofing', 'shingle', 'contractor', 'construction', 'gutters'],
  'logistics': ['freight', 'transport', 'trucking', 'carrier', 'supply chain', 'warehouse', 'fleet', 'shipping'],
  'wholesale': ['distribution', 'distributor', 'supplier', 'supply', 'b2b sales', 'inventory', 'warehouse'],
  'manufacturing': ['fabrication', 'precision', 'machining', 'industrial', 'plant', 'assembly', 'production'],
  'odoo': ['erp', 'enterprise resource planning', 'crm', 'bpo', 'python', 'postgresql', 'sla', 'rescue', 'module']
};

function taxonomyMatchScore(query, leadText) {
  const qTokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const textLower = leadText.toLowerCase();

  let score = 0;
  for (const token of qTokens) {
    if (textLower.includes(token)) {
      score += 0.4;
    }
    // Check taxonomy synonyms
    for (const [key, synonyms] of Object.entries(INDUSTRY_TAXONOMY)) {
      if (token.includes(key) || key.includes(token)) {
        for (const syn of synonyms) {
          if (textLower.includes(syn)) {
            score += 0.25;
          }
        }
      }
    }
  }
  return Math.min(1.0, score);
}

/**
 * Searches leads semantically based on meaning, industry, and context
 */
async function searchLeads(query, leads, minThreshold = 0.28) {
  if (!query || !query.trim()) return leads;
  const cleanQuery = query.trim();

  let queryVector = null;
  try {
    queryVector = await computeEmbedding(cleanQuery);
  } catch (e) {
    console.warn('Embedding computation failed:', e);
  }

  const scoredLeads = await Promise.all(leads.map(async (lead) => {
    const leadText = buildLeadContext(lead);
    let simScore = 0;

    if (queryVector) {
      let leadVector = leadVectorCache.get(lead.id);
      if (!leadVector) {
        leadVector = await computeEmbedding(leadText);
        if (leadVector) {
          leadVectorCache.set(lead.id, leadVector);
        }
      }
      if (leadVector) {
        simScore = cosineSimilarity(queryVector, leadVector);
      }
    }

    // Combine neural similarity with taxonomy and keyword bonus
    const taxScore = taxonomyMatchScore(cleanQuery, leadText);
    const combinedScore = (simScore * 0.65) + (taxScore * 0.35);

    return {
      lead,
      similarity: combinedScore
    };
  }));

  // Filter by threshold and sort by highest similarity
  return scoredLeads
    .filter(item => item.similarity >= minThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .map(item => ({
      ...item.lead,
      semantic_score: Math.round(item.similarity * 100)
    }));
}

module.exports = { searchLeads, computeEmbedding };
