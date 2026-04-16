// ═══════════════════════════════════════════════════════════════════════════════
// EDITOR MANAGER
// ═══════════════════════════════════════════════════════════════════════════════
// Orchestrates the scenario editor UI and interactions.

function EditorManager(containerId) {
  this.editor = null;
  this.containerId = containerId;
  this._lastStatusTime = 0;
  this._statusTimeout = null;
}

/** Initialize the editor. */
EditorManager.prototype.init = async function() {
  console.log('🎮 [EditorManager] Initializing editor...');
  
  // Create editor instance
  this.editor = new ScenarioEditor();
  
  // Initialize 3D scene
  if (!this.editor.init('editorCanvas')) {
    console.error('❌ [EditorManager] Failed to initialize 3D scene');
    return false;
  }
  
  // Wire up UI event listeners
  this._setupUIListeners();
  
  // Initial render
  this.editor.render();
  
  console.log('✅ [EditorManager] Editor initialized');
  this._updateScenarioInfo();
  
  return true;
};

/** Set up all UI event listeners. */
EditorManager.prototype._setupUIListeners = function() {
  var self = this;
  
  // ─── Paint Mode Buttons ───
  var btnTerrain = document.getElementById('editor-btn-terrain');
  var btnUnits = document.getElementById('editor-btn-units');
  var btnProps = document.getElementById('editor-btn-props');
  
  if (btnTerrain) {
    btnTerrain.addEventListener('click', function() {
      self.editor.setPaintMode('terrain');
      btnTerrain.classList.add('active');
      btnUnits.classList.remove('active');
      if (btnProps) btnProps.classList.remove('active');
      document.getElementById('terrain-selector').style.display = 'block';
      document.getElementById('unit-placement').style.display = 'none';
      document.getElementById('prop-placement').style.display = 'none';
      self._updateStatus('🎨 Terrain Paint Mode - Click grid to paint');
    });
  }
  
  if (btnUnits) {
    btnUnits.addEventListener('click', function() {
      self.editor.setPaintMode('units');
      btnUnits.classList.add('active');
      btnTerrain.classList.remove('active');
      if (btnProps) btnProps.classList.remove('active');
      document.getElementById('terrain-selector').style.display = 'none';
      document.getElementById('unit-placement').style.display = 'block';
      document.getElementById('prop-placement').style.display = 'none';
      self._updateStatus('👤 Unit Placement Mode - Click to place units');
    });
  }
  
  if (btnProps) {
    btnProps.addEventListener('click', function() {
      self.editor.setPaintMode('props');
      btnProps.classList.add('active');
      btnTerrain.classList.remove('active');
      btnUnits.classList.remove('active');
      document.getElementById('terrain-selector').style.display = 'none';
      document.getElementById('unit-placement').style.display = 'none';
      document.getElementById('prop-placement').style.display = 'block';
      self._updateStatus('📦 Prop Placement Mode - Click to place props');
    });
  }
  
  // ─── Terrain Palette Buttons ───
  var terrainBtns = document.querySelectorAll('.terrain-btn');
  terrainBtns.forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      var terrain = e.target.getAttribute('data-terrain');
      self.editor.setTerrainType(terrain);
      
      // Update active button
      terrainBtns.forEach(function(b) { b.classList.remove('active'); });
      e.target.classList.add('active');
      
      self._updateStatus('🎨 Selected terrain: ' + TERRAIN_TYPES[terrain].name);
    });
  });
  
  // ─── Unit Class Selector ───
  var unitClassSel = document.getElementById('editor-btn-class');
  if (unitClassSel) {
    unitClassSel.addEventListener('change', function(e) {
      self.editor.setUnitClass(e.target.value);
      self._updateStatus('👤 Unit class: ' + UNIT_CLASSES[e.target.value].name);
    });
  }
  
  // ─── Unit Team Selector ───
  var unitTeamSel = document.getElementById('editor-btn-team');
  if (unitTeamSel) {
    unitTeamSel.addEventListener('change', function(e) {
      self.editor.setUnitTeam(e.target.value);
      self._updateStatus('👤 Unit team: ' + TEAMS[e.target.value].name);
    });
  }
  
  // ─── Prop Type Selector ───
  var propTypeSel = document.getElementById('editor-btn-prop-type');
  if (propTypeSel) {
    propTypeSel.addEventListener('change', function(e) {
      self.editor.setPropType(e.target.value);
      self._updateStatus('📦 Prop type: ' + PROP_TYPES[e.target.value].name);
    });
  }
  
  // ─── Objectives Button ───
  var objBtn = document.getElementById('editor-btn-objectives');
  if (objBtn) {
    objBtn.addEventListener('click', function() {
      self._showObjectivesPanel();
    });
  }
  
  // ─── AI Config Button ───
  var aiBtn = document.getElementById('editor-btn-ai');
  if (aiBtn) {
    aiBtn.addEventListener('click', function() {
      self._showAIPanel();
    });
  }
  
  // ─── Campaign Button ───
  var campaignBtn = document.getElementById('editor-btn-campaign');
  if (campaignBtn) {
    campaignBtn.addEventListener('click', function() {
      self._showCampaignPanel();
    });
  }
  
  // ─── Save/Load Buttons ───
  var quickSaveBtn = document.querySelector('.quicksave-btn');
  var quickLoadBtn = document.querySelector('.quickload-btn');
  var downloadBtn = document.querySelector('.download-btn');
  var playBtn = document.querySelector('.play-btn');
  
  if (quickSaveBtn) {
    quickSaveBtn.addEventListener('click', function() {
      var name = self._getScenarioFilename();
      if (name) {
        self.editor.saveScenario(name);
        self._updateStatus('💾 Scenario saved: ' + name);
        self._updateScenarioInfo();
      }
    });
  }
  
  if (quickLoadBtn) {
    quickLoadBtn.addEventListener('click', function() {
      var name = self._getScenarioFilename();
      if (name) {
        var result = self.editor.loadScenario(name);
        if (result) {
          self._updateStatus('📂 Scenario loaded: ' + name);
          self._updateScenarioInfo();
        } else {
          self._updateStatus('❌ Failed to load scenario');
        }
      }
    });
  }
  
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function() {
      self._downloadScenarioJSON();
    });
  }
  
  if (playBtn) {
    playBtn.addEventListener('click', function() {
      self._playScenario();
    });
  }
  
  // Store reference for unit config panel
  this.editor._unitConfigEl = document.getElementById('editor-unit-config');
};

/** Update scenario info display. */
EditorManager.prototype._updateScenarioInfo = function() {
  var scenario = this.editor._scenario;
  if (!scenario) return;
  
  var unitCount = scenario.units ? scenario.units.length : 0;
  
  document.getElementById('editor-scenario-name').textContent = '📝 ' + scenario.name;
  document.getElementById('editor-scenario-units').textContent = '👥 Units: ' + unitCount;
  document.getElementById('editor-scenario-size').textContent = '📏 Grid: ' + scenario.width + 'x' + scenario.height;
  
  document.getElementById('editor-scenario-filename').value = scenario.name;
};

/** Get scenario filename from input. */
EditorManager.prototype._getScenarioFilename = function() {
  var input = document.getElementById('editor-scenario-filename');
  var name = input.value.trim();
  
  if (!name) {
    alert('Please enter a scenario name');
    return null;
  }
  
  return name;
};

/** Download scenario as JSON file. */
EditorManager.prototype._downloadScenarioJSON = function() {
  var scenario = this.editor._scenario;
  if (!scenario) return;
  
  var json = this.editor.getScenarioJSON();
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (scenario.name || 'scenario') + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  this._updateStatus('📥 Downloaded: ' + a.download);
};

/** Play the current scenario. */
EditorManager.prototype._playScenario = function() {
  var scenario = this.editor._scenario;
  if (!scenario || !scenario.units || scenario.units.length === 0) {
    alert('Cannot test scenario: No units placed');
    return;
  }
  
  console.log('▶️ [EditorManager] Starting scenario playback');
  console.log('Scenario:', scenario);
  
  // Store scenario in window for game to pick up
  window.TEST_SCENARIO = scenario;
  
  // Navigate to game
  window.location.hash = '#test-scenario';
};

/** Update status message. */
EditorManager.prototype._updateStatus = function(message) {
  var statusEl = document.getElementById('editor-status-text');
  if (!statusEl) return;
  
  statusEl.textContent = message;
  
  // Clear old timeout
  if (this._statusTimeout) clearTimeout(this._statusTimeout);
  
  // Keep status for 5 seconds, then clear
  this._statusTimeout = setTimeout(function() {
    statusEl.textContent = 'Ready. Click on grid to paint terrain or place units.';
  }, 5000);
};

/** Show objectives configuration panel. */
EditorManager.prototype._showObjectivesPanel = function() {
  var scenario = this.editor._scenario;
  var objMgr = this.editor._objectiveManager;
  
  var html = '<h4>🎯 Objectives</h4>' +
    '<div style="max-height: 200px; overflow-y: auto; margin-bottom: 8px;">';
  
  if (objMgr.objectives && objMgr.objectives.length > 0) {
    objMgr.objectives.forEach(function(obj, idx) {
      html += '<div style="background: #0f1828; padding: 4px; margin: 2px 0; border-radius: 2px;">' +
        '<strong>' + obj.type.name + '</strong> (' + obj.condition + ') ' +
        '<button id="obj-del-' + idx + '" style="float: right; padding: 2px 4px; font-size: 10px;">✕</button>' +
        '</div>';
    });
  } else {
    html += '<p style="color: #8899cc; font-size: 10px;">No objectives yet. Add one below.</p>';
  }
  
  html += '</div>';
  html += '<label style="font-size: 11px; color: #8899cc;">Add Objective:</label>' +
    '<select id="obj-type-sel" style="width: 100%; padding: 4px; margin: 4px 0; background: #0f1828; color: #e0e8f0; border: 1px solid #4a5f8f; border-radius: 2px;">' +
    '<option value="">-- Select Type --</option>' +
    '<option value="defeat_all">Defeat All Enemies</option>' +
    '<option value="defeat_boss">Defeat Boss Unit</option>' +
    '<option value="reach_location">Reach Location</option>' +
    '<option value="turn_limit">Turn Limit</option>' +
    '<option value="protect_unit">Protect Unit</option>' +
    '<option value="occupy_region">Occupy Region</option>' +
    '</select>' +
    '<select id="obj-cond-sel" style="width: 100%; padding: 4px; margin: 4px 0; background: #0f1828; color: #e0e8f0; border: 1px solid #4a5f8f; border-radius: 2px;">' +
    '<option value="win">Win Condition</option>' +
    '<option value="lose">Lose Condition</option>' +
    '<option value="optional">Optional</option>' +
    '</select>' +
    '<button id="obj-add-btn" style="width: 100%; padding: 6px; background: #1a2d4d; color: #e0e8f0; border: 1px solid #4a5f8f; border-radius: 2px; cursor: pointer;">+ Add Objective</button>';
  
  var panel = document.querySelector('.editor-panel:last-child');
  if (panel) {
    panel.innerHTML = html;
    
    var self = this;
    var addBtn = document.getElementById('obj-add-btn');
    if (addBtn) {
      addBtn.addEventListener('click', function() {
        var typeId = document.getElementById('obj-type-sel').value;
        var condition = document.getElementById('obj-cond-sel').value;
        if (typeId) {
          objMgr.addObjective(typeId, condition, {});
          self._showObjectivesPanel();
        }
      });
    }
    
    // Delete buttons
    objMgr.objectives.forEach(function(obj, idx) {
      var delBtn = document.getElementById('obj-del-' + idx);
      if (delBtn) {
        delBtn.addEventListener('click', function() {
          objMgr.deleteObjective(obj.id);
          self._showObjectivesPanel();
        });
      }
    });
  }
};

/** Show AI configuration panel. */
EditorManager.prototype._showAIPanel = function() {
  var scenario = this.editor._scenario;
  var aiMgr = this.editor._aiManager;
  
  if (!scenario || !scenario.units || scenario.units.length === 0) {
    var panel = document.querySelector('.editor-panel:last-child');
    if (panel) panel.innerHTML = '<h4>🤖 AI Config</h4><p style="color: #8899cc; font-size: 10px;">No units placed yet.</p>';
    return;
  }
  
  var html = '<h4>🤖 AI Configuration</h4>';
  
  scenario.units.forEach(function(unit) {
    var aiCfg = aiMgr.getBehavior(unit.id);
    var behavior = aiCfg ? aiCfg.behavior.name : 'None';
    var difficulty = aiCfg ? aiCfg.difficulty.name : '--';
    
    html += '<div style="background: #0f1828; padding: 4px; margin: 4px 0; border-radius: 2px; font-size: 10px;">' +
      '<strong>' + unit.classId + '</strong> (Team ' + unit.team + ')<br>' +
      'Behavior: ' + behavior + ' | Difficulty: ' + difficulty + '<br>' +
      '<button id="ai-cfg-' + unit.id + '" style="width: 100%; padding: 2px; margin-top: 2px; background: #1a2d4d; color: #e0e8f0; border: 1px solid #4a5f8f; border-radius: 2px; font-size: 9px; cursor: pointer;">Configure</button>' +
      '</div>';
  });
  
  var panel = document.querySelector('.editor-panel:last-child');
  if (panel) {
    panel.innerHTML = html;
    
    var self = this;
    scenario.units.forEach(function(unit) {
      var btn = document.getElementById('ai-cfg-' + unit.id);
      if (btn) {
        btn.addEventListener('click', function() {
          self._configureUnitAI(unit);
        });
      }
    });
  }
};

/** Show campaign configuration panel. */
EditorManager.prototype._showCampaignPanel = function() {
  var campaignMgr = this.editor._campaignManager;
  var scenario = this.editor._scenario;
  var campaign = campaignMgr.getCampaign();
  if (!campaign) {
    campaign = campaignMgr.createCampaign((scenario && scenario.name ? scenario.name : 'New') + ' Campaign');
  }

  var scenarioName = (scenario && scenario.name) ? scenario.name : 'Unnamed Scenario';
  var currentId = 'scenario_' + scenarioName;
  var hasCurrentNode = campaign.scenarios.some(function(s) { return s.id === currentId; });
  var safeCampaignName = campaign.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  var safeScenarioName = scenarioName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  var html = '<h4>📜 Campaign Sequences</h4>' +
    '<label style="display:block; font-size:10px; color:#8899cc; margin:4px 0;">Campaign Name</label>' +
    '<input id="campaign-name" type="text" value="' + safeCampaignName + '" style="width: 100%; padding: 4px; margin: 2px 0; background: #0f1828; color: #e0e8f0; border: 1px solid #4a5f8f; border-radius: 2px;">' +
    '<button id="campaign-save" style="width:100%; padding:6px; margin-top:4px; background:#1a2d4d; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px; cursor:pointer;">💾 Save Campaign</button>' +
    '<label style="display:block; font-size:10px; color:#8899cc; margin:8px 0 4px 0;">Load Saved Campaign</label>' +
    '<select id="campaign-load-select" style="width:100%; padding:4px; background:#0f1828; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px;">' +
    '<option value="">-- Select Campaign --</option>';

  campaignMgr.listCampaignNames().forEach(function(name) {
    html += '<option value="' + name + '">' + name + '</option>';
  });

  html += '</select>' +
    '<button id="campaign-load" style="width:100%; padding:6px; margin-top:4px; background:#1a2d4d; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px; cursor:pointer;">📂 Load Campaign</button>' +
    '<hr style="border:none; border-top:1px solid #3a4f6f; margin:8px 0;">' +
    '<div style="font-size:10px; color:#8899cc; margin-bottom:4px;">Current Scenario: <strong>' + safeScenarioName + '</strong></div>' +
    '<button id="campaign-add-current" style="width:100%; padding:6px; margin-bottom:6px; background:#1a2d4d; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px; cursor:pointer;">' + (hasCurrentNode ? '✅ Already in Campaign' : '➕ Add Current Scenario') + '</button>' +
    '<label style="display:block; font-size:10px; color:#8899cc; margin:4px 0;">Scenario Links</label>' +
    '<select id="campaign-link-from" style="width:100%; padding:4px; margin:2px 0; background:#0f1828; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px;"><option value="">From...</option>';

  campaign.scenarios.forEach(function(node) {
    html += '<option value="' + node.id + '">' + node.name + '</option>';
  });

  html += '</select>' +
    '<select id="campaign-link-to" style="width:100%; padding:4px; margin:2px 0; background:#0f1828; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px;"><option value="">To...</option>';

  campaign.scenarios.forEach(function(node) {
    html += '<option value="' + node.id + '">' + node.name + '</option>';
  });

  html += '</select>' +
    '<button id="campaign-link" style="width:100%; padding:6px; margin-top:4px; background:#1a2d4d; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px; cursor:pointer;">🔗 Link Scenarios</button>' +
    '<button id="campaign-unlink" style="width:100%; padding:6px; margin-top:4px; background:#2b1a2d; color:#e0e8f0; border:1px solid #7b4a8f; border-radius:2px; cursor:pointer;">✂️ Remove Link</button>' +
    '<label style="display:block; font-size:10px; color:#8899cc; margin:8px 0 4px 0;">Start Scenario</label>' +
    '<select id="campaign-start" style="width:100%; padding:4px; background:#0f1828; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px;">' +
    '<option value="">-- Auto --</option>';

  campaign.scenarios.forEach(function(node) {
    html += '<option value="' + node.id + '" ' + (campaign.startScenarioId === node.id ? 'selected' : '') + '>' + node.name + '</option>';
  });

  html += '</select>' +
    '<button id="campaign-set-start" style="width:100%; padding:6px; margin-top:4px; background:#1a2d4d; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px; cursor:pointer;">🏁 Set Start</button>' +
    '<hr style="border:none; border-top:1px solid #3a4f6f; margin:8px 0;">' +
    '<label style="display:block; font-size:10px; color:#8899cc; margin:4px 0;">Playback Preview</label>' +
    '<select id="campaign-preview-from" style="width:100%; padding:4px; background:#0f1828; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px;">' +
    '<option value="">Use start scenario</option>';

  campaign.scenarios.forEach(function(node) {
    html += '<option value="' + node.id + '">' + node.name + '</option>';
  });

  html += '</select>' +
    '<button id="campaign-preview" style="width:100%; padding:6px; margin-top:4px; background:#1a2d4d; color:#e0e8f0; border:1px solid #4a5f8f; border-radius:2px; cursor:pointer;">▶️ Show Next Branches</button>' +
    '<div id="campaign-preview-output" style="background:#0f1828; border:1px solid #3a4f6f; border-radius:2px; margin-top:4px; padding:6px; font-size:10px; color:#8899cc;">Select a node and preview next scenarios.</div>' +
    '<hr style="border:none; border-top:1px solid #3a4f6f; margin:8px 0;">' +
    '<div style="max-height:120px; overflow-y:auto; font-size:10px;">';

  if (campaign.scenarios.length === 0) {
    html += '<p style="color:#8899cc; margin:0;">No scenarios in campaign yet.</p>';
  } else {
    campaign.scenarios.forEach(function(node) {
      var links = node.nextScenarios.length ? node.nextScenarios.join(', ') : 'None';
      html += '<div style="background:#0f1828; border:1px solid #3a4f6f; border-radius:2px; padding:4px; margin-bottom:4px;">' +
        '<strong>' + node.name + '</strong><br>' +
        'ID: ' + node.id + '<br>' +
        'Next: ' + links +
        '</div>';
    });
  }

  html += '</div>';

  var panel = document.querySelector('.editor-panel:last-child');
  if (panel) {
    panel.innerHTML = html;
  } else {
    return;
  }

  var self = this;

  document.getElementById('campaign-save').addEventListener('click', function() {
    var name = document.getElementById('campaign-name').value.trim();
    if (!name) {
      self._updateStatus('❌ Campaign name is required');
      return;
    }
    campaignMgr.saveCampaign(name);
    self._updateStatus('💾 Campaign saved: ' + name);
    self._showCampaignPanel();
  });

  document.getElementById('campaign-load').addEventListener('click', function() {
    var selected = document.getElementById('campaign-load-select').value;
    if (!selected) {
      self._updateStatus('❌ Select a campaign to load');
      return;
    }
    var loaded = campaignMgr.loadCampaignByName(selected);
    if (!loaded) {
      self._updateStatus('❌ Failed to load campaign');
      return;
    }
    self._updateStatus('📂 Campaign loaded: ' + selected);
    self._showCampaignPanel();
  });

  document.getElementById('campaign-add-current').addEventListener('click', function() {
    if (!scenario || !scenario.name) {
      self._updateStatus('❌ Save or name the current scenario first');
      return;
    }
    var existing = campaign.scenarios.some(function(s) { return s.id === currentId; });
    if (!existing) {
      campaign.addScenario(currentId, scenario.name);
      self._updateStatus('➕ Added scenario to campaign: ' + scenario.name);
    } else {
      self._updateStatus('ℹ️ Scenario already linked in campaign');
    }
    self._showCampaignPanel();
  });

  document.getElementById('campaign-link').addEventListener('click', function() {
    var fromId = document.getElementById('campaign-link-from').value;
    var toId = document.getElementById('campaign-link-to').value;
    if (!fromId || !toId) {
      self._updateStatus('❌ Select both source and destination scenarios');
      return;
    }
    if (fromId === toId) {
      self._updateStatus('❌ A scenario cannot link to itself');
      return;
    }
    campaign.linkScenarios(fromId, toId);
    self._updateStatus('🔗 Linked campaign nodes');
    self._showCampaignPanel();
  });

  document.getElementById('campaign-unlink').addEventListener('click', function() {
    var fromId = document.getElementById('campaign-link-from').value;
    var toId = document.getElementById('campaign-link-to').value;
    if (!fromId || !toId) {
      self._updateStatus('❌ Select both source and destination scenarios');
      return;
    }
    var ok = campaign.unlinkScenarios(fromId, toId);
    self._updateStatus(ok ? '✂️ Link removed' : '⚠️ Link not found');
    self._showCampaignPanel();
  });

  document.getElementById('campaign-set-start').addEventListener('click', function() {
    var startId = document.getElementById('campaign-start').value;
    campaign.startScenarioId = startId || (campaign.scenarios[0] ? campaign.scenarios[0].id : null);
    self._updateStatus(campaign.startScenarioId ? '🏁 Campaign start set' : '⚠️ No scenarios in campaign');
    self._showCampaignPanel();
  });

  document.getElementById('campaign-preview').addEventListener('click', function() {
    var selected = document.getElementById('campaign-preview-from').value;
    var fromId = selected || campaign.startScenarioId;
    var outputEl = document.getElementById('campaign-preview-output');
    if (!fromId) {
      outputEl.textContent = 'Set a start scenario or select one to preview.';
      return;
    }
    var next = campaign.getNextScenarios(fromId);
    if (!next.length) {
      outputEl.textContent = 'No branches after this scenario. Campaign would end here.';
      return;
    }
    outputEl.textContent = 'Next branches: ' + next.map(function(n) { return n.name; }).join(', ');
  });

  this._updateStatus('📜 Campaign panel ready: linking and branching enabled');
};

/** Configure AI for a specific unit. */
EditorManager.prototype._configureUnitAI = function(unit) {
  var aiMgr = this.editor._aiManager;
  var current = aiMgr.getBehavior(unit.id);
  
  var html = '<h4>🤖 AI Config: ' + unit.classId + '</h4>' +
    '<label style="display: block; font-size: 10px; color: #8899cc; margin: 4px 0;">Behavior:</label>' +
    '<select id="ai-behavior-sel" style="width: 100%; padding: 4px; background: #0f1828; border: 1px solid #4a5f8f; border-radius: 2px;">' +
    '<option value="">-- None --</option>' +
    '<option value="patrol" ' + (current && current.behaviorId === 'patrol' ? 'selected' : '') + '>Patrol</option>' +
    '<option value="defend" ' + (current && current.behaviorId === 'defend' ? 'selected' : '') + '>Defend</option>' +
    '<option value="aggressive" ' + (current && current.behaviorId === 'aggressive' ? 'selected' : '') + '>Aggressive</option>' +
    '<option value="passive" ' + (current && current.behaviorId === 'passive' ? 'selected' : '') + '>Passive</option>' +
    '</select>' +
    '<label style="display: block; font-size: 10px; color: #8899cc; margin: 4px 0 2px 0;">Difficulty:</label>' +
    '<select id="ai-diff-sel" style="width: 100%; padding: 4px; background: #0f1828; border: 1px solid #4a5f8f; border-radius: 2px;">' +
    '<option value="easy" ' + (current && current.difficulty.id === 'easy' ? 'selected' : '') + '>Easy</option>' +
    '<option value="normal" ' + (current && current.difficulty.id === 'normal' ? 'selected' : '') + '>Normal</option>' +
    '<option value="hard" ' + (current && current.difficulty.id === 'hard' ? 'selected' : '') + '>Hard</option>' +
    '<option value="insane" ' + (current && current.difficulty.id === 'insane' ? 'selected' : '') + '>Insane</option>' +
    '</select>' +
    '<button id="ai-save-btn" style="width: 100%; padding: 6px; margin-top: 6px; background: #1a2d4d; color: #e0e8f0; border: 1px solid #4a5f8f; border-radius: 2px; cursor: pointer;">💾 Save AI Config</button>';
  
  var panel = document.querySelector('.editor-panel:last-child');
  if (panel) {
    panel.innerHTML = html;
    
    var self = this;
    document.getElementById('ai-save-btn').addEventListener('click', function() {
      var behavior = document.getElementById('ai-behavior-sel').value;
      var difficulty = document.getElementById('ai-diff-sel').value;
      
      if (behavior) {
        aiMgr.updateBehavior(unit.id, behavior, {});
        aiMgr.setDifficulty(unit.id, difficulty);
        self._updateStatus('🤖 AI configured: ' + unit.classId);
      } else {
        aiMgr.removeBehavior(unit.id);
        self._updateStatus('🤖 AI removed from unit');
      }
      self._showAIPanel();
    });
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// GLOBAL EDITOR INSTANCE
// ═══════════════════════════════════════════════════════════════════════════════

var editorManager = null;

window.addEventListener('DOMContentLoaded', function() {
  console.log('🎮 [App] Initializing Scenario Editor');
  
  // Check if we're in editor mode
  if (window.location.hash === '#editor' || !window.location.hash) {
    // Show editor UI
    var editorUI = document.getElementById('editor-container');
    if (editorUI) {
      editorUI.style.display = 'flex';
    }
    
    // Initialize editor
    editorManager = new EditorManager('editor-container');
    editorManager.init().then(function(success) {
      if (success) {
        console.log('✅ [App] Scenario Editor ready');
      }
    });
  }
});
