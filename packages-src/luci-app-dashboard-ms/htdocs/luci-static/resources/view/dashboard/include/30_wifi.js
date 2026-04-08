'use strict';
'require baseclass';
'require dom';
'require network';
'require rpc';

return baseclass.extend({
    title: _('Wireless'),
    params: [],

    // ═══════════════════════════════════════════════
    // Rate Limiter: Maximum iwinfo calls per hour
    // ═══════════════════════════════════════════════
    _iwinfoCalls: 0,
    _iwinfoResetTime: 0,
    _IWINFO_MAX_PER_HOUR: 120,
    _scanLock: false,

    _isDashboardAlive: function() {
        return document.getElementById('dashboard-active-marker') !== null;
    },

    _isDashboardVisible: function() {
        return this._isDashboardAlive() && document.visibilityState === 'visible';
    },

    _checkIwinfoRate: function() {
        var now = Date.now();
        if (now - this._iwinfoResetTime > 3600000) {
            this._iwinfoCalls = 0;
            this._iwinfoResetTime = now;
        }
        if (this._iwinfoCalls >= this._IWINFO_MAX_PER_HOUR) {
            console.warn('[Dashboard] iwinfo rate limit reached. Pausing WiFi polling.');
            return false;
        }
        this._iwinfoCalls++;
        return true;
    },

    load: function() {
        return Promise.all([
            network.getWifiDevices(),
            network.getWifiNetworks(),
            network.getHostHints(),
            fetch('/cgi-bin/mac_block').then(function(r) { return r.text(); }).catch(function() { return ''; })
        ]).then(function(radios_networks_hints) {
            var tasks = [];
            for (var i = 0; i < radios_networks_hints[1].length; i++)
                tasks.push(L.resolveDefault(radios_networks_hints[1][i].getAssocList(), []).then(L.bind(function(net, list) {
                    net.assoclist = list.sort(function(a, b) { return a.mac > b.mac; });
                }, this, radios_networks_hints[1][i])));
            return Promise.all(tasks).then(function() {
                return radios_networks_hints;
            });
        });
    },

    // ═══════════════════════════════════════════════
    // Scan clients on demand (button click)
    // ═══════════════════════════════════════════════
    _scanClients: function() {
        var self = this;
        if (self._scanLock) return;
        if (!self._checkIwinfoRate()) return;

        self._scanLock = true;

        var btn = document.getElementById('wifi-scan-btn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳';
        }

        Promise.all([
            network.getWifiNetworks(),
            network.getHostHints(),
            fetch('/cgi-bin/mac_block').then(function(r) { return r.text(); }).catch(function() { return ''; })
        ]).then(function(results) {
            var networks = results[0];
            var hosthints = results[1];
            var blockedText = results[2];

            var tasks = [];
            for (var i = 0; i < networks.length; i++)
                tasks.push(L.resolveDefault(networks[i].getAssocList(), []).then(L.bind(function(net, list) {
                    net.assoclist = list.sort(function(a, b) { return a.mac > b.mac; });
                }, self, networks[i])));

            return Promise.all(tasks).then(function() {
                self.params.blockedMacs = [];
                if (blockedText) {
                    var m = blockedText.match(/([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})/gi);
                    if (m) self.params.blockedMacs = m.map(function(x) { return x.toLowerCase(); });
                }

                self.params.wifi.devices = [];
                self._buildClientsData(networks, hosthints);
                self._rerenderClientsTable();
            });
        }).catch(function(err) {
            console.error('[Dashboard] Scan error:', err);
        }).finally(function() {
            self._scanLock = false;
            var btn2 = document.getElementById('wifi-scan-btn');
            if (btn2) {
                btn2.disabled = false;
                btn2.textContent = '🔄';
            }
        });
    },

    _buildClientsData: function(networks, hosthints) {
        var defaultNF = -90;
        var defaultCeil = -30;
        for (var i = 0; i < networks.length; i++) {
            for (var k = 0; k < networks[i].assoclist.length; k++) {
                var bss = networks[i].assoclist[k];
                var name = hosthints.getHostnameByMACAddr(bss.mac);
                var q = 100 * ((bss.signal - (bss.noise ? bss.noise : defaultNF)) / (defaultCeil - (bss.noise ? bss.noise : defaultNF)));
                var progress_style;
                if (q == 0 || q < 25) progress_style = 'bg-danger';
                else if (q < 50) progress_style = 'bg-warning';
                else if (q < 75) progress_style = 'bg-success';

                this.params.wifi.devices.push({
                    hostname: { title: _('Hostname'), visible: true, value: { name: name || '?', mac: bss.mac } },
                    ssid: { title: _('SSID'), visible: true, value: networks[i].getActiveSSID() },
                    progress: { title: _('Strength'), visible: true, value: { qualite: q, rssi: bss.signal, style: progress_style } },
                    transferred: { title: _('Transferred'), visible: true, value: { rx: '%s'.format('%.2mB'.format(bss.rx.bytes)), tx: '%s'.format('%.2mB'.format(bss.tx.bytes)) } }
                });
            }
        }
    },

    _rerenderClientsTable: function() {
        var container = document.querySelector('.router-status-wifi-devices .devices-list');
        if (!container) return;

        var oldTable = container.querySelector('table.assoclist');
        if (oldTable) oldTable.remove();

        var table = this._buildClientsTable();
        container.appendChild(table);
    },

    _buildClientsTable: function() {
        var self = this;
        var container_devices = E('table', {'class': 'table assoclist devices-info'}, [
            E('thead', {'class': 'thead dashboard-bg'}, [
                E('tr', {'class': 'tr dashboard-bg'}, [
                    E('th', {'class': 'th nowrap'}, [_('Hostname')]),
                    E('th', {'class': 'th'}, [_('SSID')]),
                    E('th', {'class': 'th'}, [_('Signal Strength')]),
                    E('th', {'class': 'th'}, [_('Transferred')]),
                    E('th', {'class': 'th'}, [_('Action')])
                ])
            ])
        ]);

        for (var i = 0; i < this.params.wifi.devices.length; i++) {
            var container_devices_item = E('tr', {'class': i % 2 ? 'tr cbi-rowstyle-2' : 'tr cbi-rowstyle-1'});
            var device = this.params.wifi.devices[i];

            // Hostname + MAC
            container_devices_item.appendChild(E('td', {'class': 'td device-info'}, [
                E('div', {'style': 'display:flex; flex-direction:column; gap:3px;'}, [
                    E('span', {'style': 'font-weight:600; color:#00ffff; font-size:12px;'}, [device.hostname.value.name]),
                    E('span', {'style': 'font-size:10px; color:#94a3b8; font-family:monospace; background:rgba(0,0,0,0.25); padding:2px 6px; border-radius:4px; width:max-content; border:1px solid rgba(255,255,255,0.05);'}, [device.hostname.value.mac])
                ])
            ]));

            // SSID
            container_devices_item.appendChild(E('td', {'class': 'td device-info'}, [
                E('p', {}, [E('span', {'style': 'font-size:12px; font-weight:500; color:#e2e8f0;'}, [device.ssid.value])])
            ]));

            // Signal
            var progressColor = device.progress.value.qualite > 70 ? '#4ade80' : device.progress.value.qualite > 30 ? '#facc15' : '#f87171';
            container_devices_item.appendChild(E('td', {'class': 'td device-info'}, [
                E('div', {'style': 'display:inline-flex; align-items:center; gap:6px; background:rgba(255,255,255,0.05); padding:4px 10px; border-radius:30px; border:1px solid rgba(255,255,255,0.08); box-shadow:0 2px 4px rgba(0,0,0,0.2);'}, [
                    E('span', {'style': 'font-weight:bold; color:' + progressColor + '; font-size:13px;'}, [parseInt(device.progress.value.qualite) + '%']),
                    E('span', {'style': 'font-size:11px; color:#cbd5e1;'}, ['(' + device.progress.value.rssi + ' dBm)'])
                ])
            ]));

            // Transferred
            container_devices_item.appendChild(E('td', {'class': 'td device-info'}, [
                E('div', {'style': 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;'}, [
                    E('span', {'style': 'background:rgba(16,185,129,0.15); color:#34d399; padding:4px 8px; border-radius:8px; font-size:11px; border:1px solid rgba(16,185,129,0.2); display:flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(0,0,0,0.2);'}, ['▲', device.transferred.value.rx]),
                    E('span', {'style': 'background:rgba(59,130,246,0.15); color:#60a5fa; padding:4px 8px; border-radius:8px; font-size:11px; border:1px solid rgba(59,130,246,0.2); display:flex; align-items:center; gap:4px; box-shadow:0 1px 3px rgba(0,0,0,0.2);'}, ['▼', device.transferred.value.tx])
                ])
            ]));

            // Block button
            var _mac = device.hostname.value.mac;
            var _isB = this.params.blockedMacs.indexOf(_mac.toLowerCase()) !== -1;
            if (_isB) {
                container_devices_item.style.background = 'rgba(239,68,68,0.06)';
                container_devices_item.style.borderLeft = '2px solid rgba(239,68,68,0.4)';
            }
            container_devices_item.appendChild(E('td', {'class': 'td device-info', 'style': 'text-align:center;'}, [
                E('button', {
                    'data-mac': _mac,
                    'data-blocked': _isB ? '1' : '0',
                    'style': 'cursor:pointer;border:none;border-radius:20px;padding:4px 14px;font-size:10px;font-weight:600;letter-spacing:0.5px;transition:all 0.3s ease;' + (_isB ? 'background:rgba(239,68,68,0.2);color:#f87171;border:1px solid rgba(239,68,68,0.3);' : 'background:rgba(255,255,255,0.08);color:#94a3b8;border:1px solid rgba(255,255,255,0.1);'),
                    'click': L.bind(function(m, ev) {
                        var b = ev.currentTarget;
                        var bl = b.getAttribute('data-blocked') === '1';
                        var act = bl ? 'unblock' : 'block';
                        b.innerText = '...';
                        fetch('/cgi-bin/mac_block?' + act + '=' + m).then(function(r) { return r.text(); }).then(function(res) {
                            if (res.trim() === 'ok') {
                                var row = b.closest('tr');
                                if (act === 'block') {
                                    b.setAttribute('data-blocked', '1'); b.innerText = 'Unblock';
                                    b.style.background = 'rgba(239,68,68,0.2)'; b.style.color = '#f87171'; b.style.borderColor = 'rgba(239,68,68,0.3)';
                                    if (row) { row.style.background = 'rgba(239,68,68,0.06)'; row.style.borderLeft = '2px solid rgba(239,68,68,0.4)'; }
                                } else {
                                    b.setAttribute('data-blocked', '0'); b.innerText = 'Block';
                                    b.style.background = 'rgba(255,255,255,0.08)'; b.style.color = '#94a3b8'; b.style.borderColor = 'rgba(255,255,255,0.1)';
                                    if (row) { row.style.background = ''; row.style.borderLeft = ''; }
                                }
                            }
                        });
                    }, this, _mac)
                }, [_isB ? _('Unblock') : _('Block')])
            ]));

            container_devices.appendChild(container_devices_item);
        }

        container_devices.appendChild(E('tfoot', {'class': 'tfoot dashboard-bg'}, [
            E('td', {'class': 'td nowrap'}, []),
            E('td', {'class': 'td'}, [_('Total') + '：']),
            E('td', {'class': 'td'}, [String(this.params.wifi.devices.length)]),
            E('td', {'class': 'td'}, []),
            E('td', {'class': 'td'}, [])
        ]));

        return container_devices;
    },

    renderHtml: function() {
        var self = this;

        // ═══════════════════════════════════════════════
        // Box 1: Wireless Radio Info
        // ═══════════════════════════════════════════════
        var box1_wrapper = E('div', {'class': 'router-status-wifi dashboard-bg box-s1'});
        var box1_inner = E('div', {'class': 'wifi-info'});
        var container_radio = E('div', {'class': 'settings-info wifi-radios-flex'});

        box1_inner.appendChild(E('div', {'class': 'title'}, [
            E('img', {'src': L.resource('view/dashboard/icons/wireless.svg'), 'width': 55, 'title': this.title, 'class': 'middle svgmonotone'}),
            E('h3', this.title)
        ]));

        for (var i = 0; i < this.params.wifi.radios.length; i++) {
            var container_radio_item = E('div', {'class': 'radio-info'});
            for (var idx in this.params.wifi.radios[i]) {
                var classname = idx;
                var radio = this.params.wifi.radios[i];
                if (!radio[idx].visible) continue;
                if ('isactive' === idx) {
                    classname = radio[idx].value ? 'label label-success' : 'label label-danger';
                    radio[idx].value = radio[idx].value ? _('yes') : _('no');
                }
                container_radio_item.appendChild(E('p', {}, [
                    E('span', {'class': ''}, [radio[idx].title + '：']),
                    E('span', {'class': classname}, [radio[idx].value])
                ]));
            }
            container_radio.appendChild(container_radio_item);
        }
        box1_inner.appendChild(container_radio);
        box1_wrapper.appendChild(box1_inner);

        // ═══════════════════════════════════════════════
        // Box 2: Wireless Clients (with Scan Button)
        // ═══════════════════════════════════════════════
        var box2_wrapper = E('div', {'class': 'router-status-wifi-devices dashboard-bg box-s1'});
        var box2_inner = E('div', {'class': 'wifi-info devices-list'});

        var scanBtn = E('button', {
            'id': 'wifi-scan-btn',
            'title': _('Refresh client list'),
            'style': 'cursor:pointer; background:rgba(0,255,255,0.1); border:1px solid rgba(0,255,255,0.3); border-radius:8px; padding:4px 10px; font-size:14px; color:#00ffff; transition:all 0.3s ease; margin-left:auto;',
            'click': function() { self._scanClients(); }
        }, ['🔄']);

        box2_inner.appendChild(E('div', {'class': 'title', 'style': 'display:flex; align-items:center;'}, [
            E('img', {'src': L.resource('view/dashboard/icons/wireless.svg'), 'width': 55, 'title': _('Wireless Clients'), 'class': 'middle svgmonotone'}),
            E('h3', _('Wireless Clients')),
            scanBtn
        ]));

        box2_inner.appendChild(this._buildClientsTable());
        box2_wrapper.appendChild(box2_inner);

        // Merge LAN + WiFi clients layout
        requestAnimationFrame(function() {
            var lanBox = document.querySelector('.router-status-lan');
            var wifiBox = document.querySelector('.router-status-wifi-devices');
            if (lanBox && wifiBox && lanBox.parentNode) {
                lanBox.classList.remove('dashboard-bg', 'box-s1');
                wifiBox.classList.remove('dashboard-bg', 'box-s1');
                var unified = document.createElement('div');
                unified.className = 'dashboard-bg box-s1 unified-devices-box';
                unified.style.cssText = 'width:100%;padding:14px;display:grid;grid-template-columns:repeat(auto-fit, minmax(min(100%, 450px), 1fr));gap:15px;';
                lanBox.parentNode.insertBefore(unified, lanBox);
                unified.appendChild(wifiBox);
                unified.appendChild(lanBox);
                wifiBox.style.cssText = 'padding:0;margin:0;border-top:none;overflow-x:auto;';
                lanBox.style.cssText = 'padding:0;margin:0;border-top:none;overflow-x:auto;';
            }
        });

        return [box1_wrapper, box2_wrapper];
    },

    renderUpdateData: function(radios, networks, hosthints) {
        for (var i = 0; i < radios.sort(function(a, b) { return a.getName() > b.getName(); }).length; i++) {
            var network_items = networks.filter(function(net) { return net.getWifiDeviceName() == radios[i].getName(); });
            for (var j = 0; j < network_items.length; j++) {
                var net = network_items[j];
                var is_assoc = (net.getBSSID() != '00:00:00:00:00:00' && net.getChannel() && !net.isDisabled());
                var chan = net.getChannel();
                var freq = net.getFrequency();
                var rate = net.getBitRate();
                this.params.wifi.radios.push({
                    _mode: { visible: false, value: net.getMode() },
                    ssid: { title: _('SSID'), visible: true, value: net.getActiveSSID() || '?' },
                    isactive: { title: _('Active'), visible: true, value: !net.isDisabled() },
                    chan: { title: _('Channel'), visible: true, value: chan ? '%d (%.3f %s)'.format(chan, freq, _('GHz')) : '-' },
                    rate: { title: _('Bitrate'), visible: true, value: rate ? '%d %s'.format(rate, _('Mbit/s')) : '-' },
                    bssid: { title: _('BSSID'), visible: true, value: is_assoc ? (net.getActiveBSSID() || '-') : '-' },
                    encryption: { title: _('Encryption'), visible: true, value: is_assoc ? net.getActiveEncryption() : '-' },
                    associations: { title: _('Devices Connected'), visible: true, value: is_assoc ? (net.assoclist.length || '0') : 0 }
                });
            }
        }
        this.params.wifi.radios.sort(function(a, b) {
            var mA = (a._mode.value || '').toLowerCase();
            var mB = (b._mode.value || '').toLowerCase();
            var sA = mA.includes('sta') || mA.includes('client');
            var sB = mB.includes('sta') || mB.includes('client');
            if (sA && !sB) return 1;
            if (!sA && sB) return -1;
            return a.ssid.value > b.ssid.value ? -1 : 1;
        });
    },

    // ═══════════════════════════════════════════════
    // Radio Info Polling — Every 60 Seconds
    // ═══════════════════════════════════════════════
    startPolling: function() {
        if (this._pollingStarted) return;
        this._pollingStarted = true;
        var self = this;

        var updateRadio = function() {
            if (!self._isDashboardAlive()) return;

            if (!self._isDashboardVisible() || !self._checkIwinfoRate()) {
                setTimeout(updateRadio, 60000);
                return;
            }

            Promise.all([
                network.getWifiDevices(),
                network.getWifiNetworks()
            ]).then(function(results) {
                var radios = results[0];
                var networks = results[1];

                // Rebuild radio data
                self.params.wifi.radios = [];
                var radioItems = networks.filter(function() { return true; });
                for (var i = 0; i < radios.length; i++) {
                    var items = networks.filter(function(net) { return net.getWifiDeviceName() == radios[i].getName(); });
                    for (var j = 0; j < items.length; j++) {
                        var net = items[j];
                        var is_assoc = (net.getBSSID() != '00:00:00:00:00:00' && net.getChannel() && !net.isDisabled());
                        var chan = net.getChannel();
                        var freq = net.getFrequency();
                        var rate = net.getBitRate();
                        self.params.wifi.radios.push({
                            _mode: { visible: false, value: net.getMode() },
                            ssid: { title: _('SSID'), visible: true, value: net.getActiveSSID() || '?' },
                            isactive: { title: _('Active'), visible: true, value: !net.isDisabled() ? _('yes') : _('no') },
                            chan: { title: _('Channel'), visible: true, value: chan ? '%d (%.3f %s)'.format(chan, freq, _('GHz')) : '-' },
                            rate: { title: _('Bitrate'), visible: true, value: rate ? '%d %s'.format(rate, _('Mbit/s')) : '-' },
                            bssid: { title: _('BSSID'), visible: true, value: is_assoc ? (net.getActiveBSSID() || '-') : '-' },
                            encryption: { title: _('Encryption'), visible: true, value: is_assoc ? net.getActiveEncryption() : '-' },
                            associations: { title: _('Devices Connected'), visible: true, value: is_assoc ? (net.assoclist.length || '0') : 0 }
                        });
                    }
                }

                // Update radio DOM
                var radioContainer = document.querySelector('.router-status-wifi .wifi-radios-flex');
                if (radioContainer) {
                    radioContainer.innerHTML = '';
                    for (var r = 0; r < self.params.wifi.radios.length; r++) {
                        var item = E('div', {'class': 'radio-info'});
                        for (var idx in self.params.wifi.radios[r]) {
                            var rd = self.params.wifi.radios[r];
                            if (!rd[idx].visible) continue;
                            var cn = idx;
                            if ('isactive' === idx) cn = (rd[idx].value === _('yes')) ? 'label label-success' : 'label label-danger';
                            item.appendChild(E('p', {}, [
                                E('span', {}, [rd[idx].title + '：']),
                                E('span', {'class': cn}, [rd[idx].value])
                            ]));
                        }
                        radioContainer.appendChild(item);
                    }
                }
            }).catch(function() {})
            .finally(function() {
                if (self._isDashboardAlive()) setTimeout(updateRadio, 60000);
            });
        };
        setTimeout(updateRadio, 60000);
    },

    render: function(data) {
        var radios = data[0], networks = data[1], hosthints = data[2], blockedText = data[3];

        this.params.wifi = { radios: [], devices: [] };
        this.params.blockedMacs = [];

        if (blockedText) {
            var m = blockedText.match(/([0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2}:[0-9a-fA-F]{2})/gi);
            if (m) this.params.blockedMacs = m.map(function(x) { return x.toLowerCase(); });
        }

        this.renderUpdateData(radios, networks, hosthints);
        this._buildClientsData(networks, hosthints);

        if (this.params.wifi.radios.length)
            return this.renderHtml();
        return E([]);
    }
});