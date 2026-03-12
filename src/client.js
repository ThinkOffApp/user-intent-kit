// SPDX-License-Identifier: AGPL-3.0

/**
 * IntentClient - REST client for the User Intent API.
 * Talks to an Ant Farm instance hosting profile + intent endpoints.
 */
export class IntentClient {
  #baseUrl;
  #apiKey;
  #userId;
  #deviceId;
  #heartbeatTimer;
  #heartbeatIntervalMs;

  /**
   * @param {object} opts
   * @param {string} opts.baseUrl - Ant Farm API base URL (e.g. "https://antfarm.world/api/v1")
   * @param {string} opts.apiKey - X-API-Key for authentication
   * @param {string} opts.userId - User ID to read/write intent for
   * @param {string} [opts.deviceId] - Device slot this client writes to (omit for read-only)
   * @param {number} [opts.heartbeatIntervalMs=30000] - Heartbeat interval in ms
   */
  constructor({ baseUrl, apiKey, userId, deviceId, heartbeatIntervalMs = 30000 }) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '');
    this.#apiKey = apiKey;
    this.#userId = userId;
    this.#deviceId = deviceId || null;
    this.#heartbeatIntervalMs = Math.max(heartbeatIntervalMs, 10000);
    this.#heartbeatTimer = null;
  }

  // --- Profile (static layer) ---

  async getProfile() {
    return this.#request('GET', `/profile/${this.#userId}`);
  }

  async updateProfile(fields) {
    return this.#request('PUT', `/profile/${this.#userId}`, fields);
  }

  // --- Intent (live layer) ---

  async getIntent() {
    return this.#request('GET', `/intent/${this.#userId}`);
  }

  async patchDevice(fields) {
    if (!this.#deviceId) throw new Error('No deviceId configured');
    return this.#request('PATCH', `/intent/${this.#userId}/${this.#deviceId}`, fields);
  }

  async setDevice(fields) {
    if (!this.#deviceId) throw new Error('No deviceId configured');
    return this.#request('PUT', `/intent/${this.#userId}/${this.#deviceId}`, fields);
  }

  async removeDevice(deviceId) {
    const id = deviceId || this.#deviceId;
    if (!id) throw new Error('No deviceId specified');
    return this.#request('DELETE', `/intent/${this.#userId}/${id}`);
  }

  async patchAgent(agentName, fields) {
    return this.#request('PATCH', `/intent/${this.#userId}/agents/${agentName}`, fields);
  }

  // --- Derived state helpers ---

  async getDerived() {
    const intent = await this.getIntent();
    return intent.derived || {};
  }

  async isInMeeting() {
    const derived = await this.getDerived();
    return derived.urgency_mode === 'text-only' || false;
  }

  async preferredModality() {
    const derived = await this.getDerived();
    return derived.available_modalities || ['read', 'listen', 'speak'];
  }

  async shouldSuppressAudio() {
    const derived = await this.getDerived();
    return derived.suppress_audio || false;
  }

  async preferredDevice() {
    const derived = await this.getDerived();
    return derived.preferred_device || null;
  }

  // --- Heartbeat ---

  async heartbeat() {
    if (!this.#deviceId) throw new Error('No deviceId configured');
    return this.#request('PATCH', `/intent/${this.#userId}/${this.#deviceId}`, { heartbeat: true });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.#heartbeatTimer = setInterval(() => {
      this.heartbeat().catch(() => {});
    }, this.#heartbeatIntervalMs);
    // Don't keep process alive just for heartbeats
    if (this.#heartbeatTimer.unref) this.#heartbeatTimer.unref();
  }

  stopHeartbeat() {
    if (this.#heartbeatTimer) {
      clearInterval(this.#heartbeatTimer);
      this.#heartbeatTimer = null;
    }
  }

  // --- Internal ---

  async #request(method, path, body) {
    const url = `${this.#baseUrl}${path}`;
    const headers = {
      'X-API-Key': this.#apiKey,
      'Content-Type': 'application/json',
    };

    const opts = { method, headers };
    if (body && method !== 'GET' && method !== 'DELETE') {
      opts.body = JSON.stringify(body);
    }

    const res = await fetch(url, opts);

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`Intent API ${method} ${path}: ${res.status} ${res.statusText}`);
      err.status = res.status;
      err.body = text;
      throw err;
    }

    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return res.json();
    }
    return null;
  }

  get userId() { return this.#userId; }
  get deviceId() { return this.#deviceId; }
}
