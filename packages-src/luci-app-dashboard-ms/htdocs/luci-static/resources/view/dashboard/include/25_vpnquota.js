'use strict';
'require baseclass';
'require dom';

return baseclass.extend({
    title: _('VPN Quota'),

    _isDashboardAlive: function() {
        return document.getElementById('dashboard-active-marker') !== null;
    },

    _isDashboardVisible: function() {
        return this._isDashboardAlive() && document.visibilityState === 'visible';
    },

    load: function() {
        return Promise.all([
            fetch('/cgi-bin/vpn_quota', { cache: 'no-store' })
                .then(function(res) { return res.text(); })
                .catch(function() { return ''; }),
            fetch('/cgi-bin/vpn_ctrl', { cache: 'no-store' })
                .then(function(res) { return res.text(); })
                .catch(function() { return 'stopped'; })
        ]);
    },

    _buildWidget: function(data) {
        var stdout = data[0];
        var vpnState = data[1] ? data[1].trim() : 'stopped';
        var isRunning = vpnState === 'running';
        var up = 0, down = 0, total = 0, expire = 0;
        var found = false;

        if (stdout) {
            var m = stdout.match(/Subscription-Userinfo:\s*upload=(\d+);\s*download=(\d+);\s*total=(\d+);\s*expire=(\d+)/i);
            if (m) {
                up = parseInt(m[1]); down = parseInt(m[2]); total = parseInt(m[3]); expire = parseInt(m[4]);
                found = true;
            }
        }

        if (!found) return null;

        var used = up + down;
        var remaining = total - used;
        if (remaining < 0) remaining = 0;

        var formatBytes = function(bytes) {
            if (bytes === 0) return '0 B';
            var k = 1073741824;
            if (bytes < k) return (bytes / 1048576).toFixed(2) + ' MB';
            var i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' GB';
        };

        var usedStr = formatBytes(used);
        var remStr = total > 0 ? formatBytes(remaining) : 'Unlimited';
        var totalStr = total > 0 ? formatBytes(total) : 'Unlimited';
        var percent = total > 0 ? Math.round((used / total) * 100) : 0;
        var color = percent >= 95 ? '#ef4444' : percent > 75 ? '#f59e0b' : '#10b981';

        var now = Math.floor(Date.now() / 1000);
        var daysLeft = expire > 0 ? Math.floor((expire - now) / 86400) : -1;
        var expireStr = '';
        if (daysLeft > 1) expireStr = daysLeft + ' Days Left';
        else if (daysLeft === 1) expireStr = '1 Day Left';
        else if (expire === 0) expireStr = 'Unlimited';
        else expireStr = 'Expired';

        var toggleColor = isRunning ? '#10b981' : '#ef4444';
        var toggleText = isRunning ? 'ON' : 'OFF';

        return E('div', { class: 'vpn-quota-widget', style: 'margin-top: 12px; border-top: 1px dashed rgba(255,255,255,0.15); padding-top: 12px;' }, [
            E('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom: 8px;' }, [
                E('div', {style:'display:flex; align-items:center; gap:6px;'}, [
                    E('span', {style:'font-size:14px;'}, ['🛡️']),
                    E('span', {style:'color:#00ffff; font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:1px;'}, ['VPN Quota']),
                    E('button', {
                        style: 'margin-left: 8px; cursor: pointer; background: rgba(0,0,0,0.3); border: 1px solid ' + toggleColor + '40; border-radius: 12px; padding: 2px 8px; display: flex; align-items: center; gap: 4px; transition: all 0.3s ease;',
                        click: function(ev) {
                            var btn = ev.currentTarget;
                            var indicator = btn.querySelector('.vpn-indicator');
                            var txt = btn.querySelector('.vpn-txt');
                            txt.innerText = 'WAIT...';
                            indicator.style.background = '#f59e0b';
                            indicator.style.boxShadow = '0 0 5px #f59e0b';
                            var action = isRunning ? 'stop' : 'start';
                            fetch('/cgi-bin/vpn_ctrl?' + action)
                                .then(function(res) { return res.text(); })
                                .then(function(state) {
                                    state = state.trim();
                                    var newRun = state === 'running';
                                    var newColor = newRun ? '#10b981' : '#ef4444';
                                    indicator.style.background = newColor;
                                    indicator.style.boxShadow = '0 0 8px ' + newColor;
                                    txt.innerText = newRun ? 'ON' : 'OFF';
                                    txt.style.color = newColor;
                                    btn.style.borderColor = newColor + '40';
                                    isRunning = newRun;
                                });
                        }
                    }, [
                        E('div', { class: 'vpn-indicator', style: 'width: 6px; height: 6px; border-radius: 50%; background: ' + toggleColor + '; box-shadow: 0 0 8px ' + toggleColor + '; transition: all 0.3s;' }),
                        E('span', { class: 'vpn-txt', style: 'font-size: 9px; font-weight: bold; color: ' + toggleColor + '; letter-spacing: 0.5px; transition: all 0.3s;' }, [toggleText])
                    ])
                ]),
                E('span', {style: percent >= 95 ? 'background:rgba(239,68,68,0.2); color:#f87171; padding:2px 8px; border-radius:12px; font-size:9px; border:1px solid rgba(239,68,68,0.3);' : 'background:rgba(255,255,255,0.1); color:#cbd5e1; padding:2px 8px; border-radius:12px; font-size:9px; border:1px solid rgba(255,255,255,0.1);'}, [expireStr])
            ]),
            E('div', { style: 'display:flex; justify-content:space-between; font-size:11px; margin-bottom: 6px;' }, [
                E('span', {style:'color:#94a3b8; font-size:10px;'}, ['Used: ', E('span', {style:'color:#f1f5f9;font-weight:600;'}, [usedStr])]),
                E('span', {style:'color:#94a3b8; font-size:10px;'}, ['Left: ', E('span', {style:'color:#10b981;font-weight:600;'}, [remStr])]),
                E('span', {style:'color:#94a3b8; font-size:10px;'}, ['Total: ', E('span', {style:'color:#00ffff;font-weight:600;'}, [totalStr])])
            ]),
            E('div', { class: 'cbi-progressbar', style: 'height: 6px; background: rgba(0,0,0,0.4); border-radius:10px; overflow:hidden; border: 1px solid rgba(255,255,255,0.05);' }, [
                E('div', { style: 'width: ' + percent + '%; height: 100%; background: ' + color + '; box-shadow: 0 0 8px ' + color + '; border-radius:10px;' })
            ])
        ]);
    },

    _attachWidget: function(widget) {
        if (!widget) return;
        var internetBox = document.querySelector('.internet-status-self');
        if (internetBox) {
            var old = internetBox.querySelector('.vpn-quota-widget');
            if (old) old.remove();
            internetBox.appendChild(widget);
        }
    },

    startPolling: function() {
        if (this._pollingStarted) return;
        this._pollingStarted = true;
        var self = this;

        var updateVpn = function() {
            if (!self._isDashboardAlive()) return;

            if (!self._isDashboardVisible()) {
                setTimeout(updateVpn, 60000);
                return;
            }

            self.load().then(function(data) {
                var widget = self._buildWidget(data);
                self._attachWidget(widget);
            }).catch(function() {})
            .finally(function() {
                if (self._isDashboardAlive()) setTimeout(updateVpn, 60000);
            });
        };
        setTimeout(updateVpn, 60000);
    },

    renderHtml: function(data) {
        var box = E('div', {style: 'display:none;'}, []);
        var widget = this._buildWidget(data);

        requestAnimationFrame(L.bind(function() {
            this._attachWidget(widget);
        }, this));

        return box;
    },

    render: function(stdout) {
        return this.renderHtml(stdout);
    }
});
