// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN SEQUENCING SYSTEM (Phase 2)
// ═══════════════════════════════════════════════════════════════════════════════
// Link multiple scenarios into campaign sequences with branching.

function CampaignSequence() {
  this.id = 'campaign_' + Date.now();
  this.name = 'New Campaign';
  this.description = '';
  this.scenarios = [];  // Array of { scenarioId, scenarioName, nextScenarios: [...] }
  this.startScenarioId = null;
  this.metadata = {
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/** Add a scenario to the campaign. */
CampaignSequence.prototype.addScenario = function(scenarioId, scenarioName) {
  var scenarioNode = {
    id: scenarioId,
    name: scenarioName,
    index: this.scenarios.length,
    nextScenarios: [],  // Branching: array of next scenario IDs
    position: { x: 0, y: 0 }  // For UI visualization
  };
  
  if (this.scenarios.length === 0) {
    this.startScenarioId = scenarioId;
  }
  
  this.scenarios.push(scenarioNode);
  console.log('✅ [Campaign] Added scenario:', scenarioName);
  return scenarioNode;
};

/** Link two scenarios in sequence. */
CampaignSequence.prototype.linkScenarios = function(fromScenarioId, toScenarioId) {
  var fromNode = this.scenarios.find(function(s) { return s.id === fromScenarioId; });
  if (!fromNode) {
    console.error('❌ [Campaign] Source scenario not found:', fromScenarioId);
    return false;
  }
  
  if (!fromNode.nextScenarios.includes(toScenarioId)) {
    fromNode.nextScenarios.push(toScenarioId);
  }
  
  console.log('🔗 [Campaign] Linked', fromScenarioId, '→', toScenarioId);
  return true;
};

/** Remove link between scenarios. */
CampaignSequence.prototype.unlinkScenarios = function(fromScenarioId, toScenarioId) {
  var fromNode = this.scenarios.find(function(s) { return s.id === fromScenarioId; });
  if (!fromNode) return false;
  
  var idx = fromNode.nextScenarios.indexOf(toScenarioId);
  if (idx > -1) {
    fromNode.nextScenarios.splice(idx, 1);
    console.log('✂️ [Campaign] Unlinked', fromScenarioId, '→', toScenarioId);
    return true;
  }
  return false;
};

/** Remove scenario from campaign. */
CampaignSequence.prototype.removeScenario = function(scenarioId) {
  var idx = this.scenarios.findIndex(function(s) { return s.id === scenarioId; });
  if (idx < 0) return false;
  
  this.scenarios.splice(idx, 1);
  
  // Remove all links to/from this scenario
  this.scenarios.forEach(function(scenario) {
    var linkIdx = scenario.nextScenarios.indexOf(scenarioId);
    if (linkIdx > -1) {
      scenario.nextScenarios.splice(linkIdx, 1);
    }
  });
  
  if (this.startScenarioId === scenarioId) {
    this.startScenarioId = this.scenarios.length > 0 ? this.scenarios[0].id : null;
  }
  
  console.log('🗑️ [Campaign] Removed scenario:', scenarioId);
  return true;
};

/** Get next possible scenarios after current one. */
CampaignSequence.prototype.getNextScenarios = function(scenarioId) {
  var node = this.scenarios.find(function(s) { return s.id === scenarioId; });
  if (!node) return [];
  
  return node.nextScenarios.map(function(nextId) {
    return this.scenarios.find(function(s) { return s.id === nextId; });
  }, this).filter(function(s) { return s; });
};

/** Check if campaign is valid (all links are valid). */
CampaignSequence.prototype.validate = function() {
  var errors = [];
  var validIds = this.scenarios.map(function(s) { return s.id; });
  
  this.scenarios.forEach(function(scenario) {
    scenario.nextScenarios.forEach(function(nextId) {
      if (!validIds.includes(nextId)) {
        errors.push('Invalid link from ' + scenario.id + ' to ' + nextId);
      }
    });
  });
  
  return errors;
};

/** Serialize campaign to JSON. */
CampaignSequence.prototype.toJSON = function() {
  return {
    id: this.id,
    name: this.name,
    description: this.description,
    startScenarioId: this.startScenarioId,
    scenarios: this.scenarios.map(function(s) {
      return {
        id: s.id,
        name: s.name,
        nextScenarios: s.nextScenarios,
        position: s.position
      };
    }),
    metadata: this.metadata
  };
};

/** Load campaign from JSON. */
CampaignSequence.fromJSON = function(json) {
  var campaign = new CampaignSequence();
  campaign.id = json.id;
  campaign.name = json.name || 'Campaign';
  campaign.description = json.description || '';
  campaign.startScenarioId = json.startScenarioId;
  campaign.metadata = json.metadata || {};
  
  campaign.scenarios = (json.scenarios || []).map(function(sData, idx) {
    return {
      id: sData.id,
      name: sData.name,
      index: idx,
      nextScenarios: sData.nextScenarios || [],
      position: sData.position || { x: 0, y: 0 }
    };
  });
  
  return campaign;
};

// ═══════════════════════════════════════════════════════════════════════════════
// CAMPAIGN MANAGER - manages multiple campaigns
// ═══════════════════════════════════════════════════════════════════════════════

function CampaignManager() {
  this.currentCampaign = null;
}

CampaignManager.STORAGE_PREFIX = 'campaign_';

/** Create a new campaign. */
CampaignManager.prototype.createCampaign = function(name) {
  var campaign = new CampaignSequence();
  campaign.name = name || 'New Campaign';
  this.currentCampaign = campaign;
  console.log('✅ [CampaignManager] Created campaign:', name);
  return campaign;
};

/** Load campaign. */
CampaignManager.prototype.loadCampaign = function(campaign) {
  this.currentCampaign = campaign;
  console.log('📂 [CampaignManager] Loaded campaign:', campaign.name);
  return campaign;
};

/** Get current campaign. */
CampaignManager.prototype.getCampaign = function() {
  return this.currentCampaign;
};

/** Save current campaign to localStorage. */
CampaignManager.prototype.saveCampaign = function(name) {
  if (!this.currentCampaign) return null;

  if (name && typeof name === 'string' && name.trim()) {
    this.currentCampaign.name = name.trim();
  }

  this.currentCampaign.metadata = this.currentCampaign.metadata || {};
  this.currentCampaign.metadata.updatedAt = new Date().toISOString();

  var key = CampaignManager.STORAGE_PREFIX + this.currentCampaign.name;
  localStorage.setItem(key, JSON.stringify(this.currentCampaign.toJSON()));
  console.log('💾 [CampaignManager] Saved campaign:', this.currentCampaign.name);
  return this.currentCampaign.name;
};

/** Load campaign by storage name. */
CampaignManager.prototype.loadCampaignByName = function(name) {
  var key = CampaignManager.STORAGE_PREFIX + name;
  var raw = localStorage.getItem(key);
  if (!raw) return null;

  var json = JSON.parse(raw);
  var campaign = CampaignSequence.fromJSON(json);
  return this.loadCampaign(campaign);
};

/** List all saved campaign names from localStorage. */
CampaignManager.prototype.listCampaignNames = function() {
  var names = [];
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.indexOf(CampaignManager.STORAGE_PREFIX) === 0) {
      names.push(key.slice(CampaignManager.STORAGE_PREFIX.length));
    }
  }
  names.sort();
  return names;
};

/** Remove a saved campaign by name. */
CampaignManager.prototype.deleteCampaign = function(name) {
  localStorage.removeItem(CampaignManager.STORAGE_PREFIX + name);
};
