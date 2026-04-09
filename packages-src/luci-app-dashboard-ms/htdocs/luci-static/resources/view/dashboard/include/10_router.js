'use strict';
'require baseclass';
'require fs';
'require rpc';
'require network';
'require uci';

var callSystemBoard = rpc.declare({object: 'system', method: 'board'});
var callSystemInfo = rpc.declare({object: 'system', method: 'info'});
var callGetUnixtime = rpc.declare({object: 'luci', method: 'getUnixtime', expect: {result: 0}});

return baseclass.extend({
    params: [],
    prev_cpu_stat: null,
    _internetLock: false,
    _resourceLock: false,

    _isDashboardAlive: function() {
        return document.getElementById('dashboard-active-marker') !== null;
    },

    _isDashboardVisible: function() {
        return this._isDashboardAlive() && document.visibilityState === 'visible';
    },

    load: function() {
        return Promise.all([
            network.getWANNetworks(),
            network.getWAN6Networks(),
            L.resolveDefault(callSystemBoard(), {}),
            L.resolveDefault(callSystemInfo(), {}),
            L.resolveDefault(callGetUnixtime(), 0),
            uci.load('system'),
            fetch('/cgi-bin/internet_check').then(function(r) { return r.text(); }).catch(function() { return 'false'; }),
            fetch('/cgi-bin/real_ip').then(function(r) { return r.text(); }).catch(function() { return '-'; })
        ]);
    },

    renderRow: function(title, value, className, tag) {
        className = className || '';
        tag = tag || 'p';
        return E(tag, {'class': 'mt-2'}, [
            E('span', {}, [title + ': ']),
            E('span', {'class': className}, [value])
        ]);
    },

    renderArrayAsTable: function(title, values) {
        var table = E('table', {'class': 'table'});
        if (Array.isArray(values) && values.length > 0) {
            values.forEach(function(val) {
                table.appendChild(E('tr', {}, [E('td', {}, [title + ': ']), E('td', {}, [val])]));
            });
        } else {
            table.appendChild(E('tr', {}, [E('td', {}, [title + ': ']), E('td', {}, ['-'])]));
        }
        return table;
    },

    renderHtml: function(data, type) {
        var icon = type;
        var title = 'router' == type ? _('System') : _('Internet');
        var container_wapper = E('div', {'class': type + '-status-self dashboard-bg box-s1'});
        var container_box = E('div', {'class': type + '-status-info'});
        var container_item = E('div', {'class': 'settings-info'});

        if ('internet' == type) {
            icon = data.connected.value ? type : 'not-internet';
        }

        container_box.appendChild(E('div', {'class': 'title'}, [
            E('img', {
                'src': L.resource('view/dashboard/icons/' + icon + '.svg'),
                'width': 'router' == type ? 64 : 54,
                'title': title,
                'class': (type == 'router' || icon == 'not-internet') ? 'middle svgmonotone' : 'middle'
            }),
            E('h3', title)
        ]));
        container_box.appendChild(E('hr'));

        for (var idx in data) {
            var classname = '';
            var val = data[idx].value;
            var titleStr = data[idx].title;

            if ('internet' == type && 'connected' === idx) {
                classname = val ? 'label label-success' : 'label label-danger';
                val = val ? _('yes') : _('no');
            }

            if ('internet' == type && 'addrsv4' === idx) {
                if (Array.isArray(val) && val.length) {
                    val = val[0].split('/')[0];
                }
            }

            if (['dnsv4'].includes(idx) && Array.isArray(val)) {
                var dnsEl = this.renderArrayAsTable(titleStr, val);
                if ('internet' == type) dnsEl.setAttribute('data-field', idx);
                container_item.appendChild(dnsEl);
            } else {
                var row = this.renderRow(titleStr, val, classname);
                if ('internet' == type && 'connected' === idx && data[idx].realIp && data[idx].realIp !== '-' && data[idx].realIp !== '') {
                    var flagText = data[idx].realCountry ? ' ' + data[idx].realCountry : '';
                    row = E('p', {'class': 'mt-2', 'style': 'flex-direction:row !important; justify-content:space-between; align-items:center;'}, [
                        E('span', {}, [titleStr + ': ']),
                        E('span', {'class': classname}, [val]),
                        E('span', {style: 'margin-left:auto; font-weight:600; color:#00ffff; font-size:11px; font-family:monospace; background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:12px; border:1px solid rgba(0,255,255,0.2); text-shadow:0 0 5px rgba(0,255,255,0.2);'}, [data[idx].realIp + flagText])
                    ]);
                }
                if ('internet' == type) row.setAttribute('data-field', idx);
                container_item.appendChild(row);
            }
        }

        container_box.appendChild(container_item);

        if ('router' == type) {
            container_box.appendChild(E('hr'));
        }

        container_wapper.appendChild(container_box);
        return container_wapper;
    },

    renderUpdateWanData: function(data, isRealInternet) {
        var min_metric = 2000000000;
        var min_metric_i = 0;
        for (var i = 0; i < data.length; i++) {
            var metric = data[i].getMetric();
            if (metric < min_metric) {
                min_metric = metric;
                min_metric_i = i;
            }
        }
        var ifc = data[min_metric_i];
        if (ifc) {
            var uptime = ifc.getUptime();
            this.params.internet.uptime.value = (uptime > 0) ? '%t'.format(uptime) : '-';
            this.params.internet.protocol.value = ifc.getI18n() || E('em', _('Not connected'));
            this.params.internet.gatewayv4.value = ifc.getGatewayAddr() || '0.0.0.0';
            this.params.internet.connected.value = isRealInternet;
            this.params.internet.addrsv4.value = ifc.getIPAddrs() || ['-'];
            this.params.internet.dnsv4.value = ifc.getDNSAddrs() || ['-'];
        }
    },

    renderInternetBox: function(data) {
        var isRealInternet = data[6] ? data[6].trim() === 'true' : false;
        var realIp = '-', realCountry = '';
        if (data[7] && data[7].trim() !== '') {
            var parts = data[7].trim().split('|');
            realIp = parts[0] || '-';
            if (parts[1]) {
                var cc = parts[1].toUpperCase();
                realCountry = String.fromCodePoint.apply(null, Array.from(cc).map(function(c) { return 0x1F1E6 + c.charCodeAt(0) - 0x41; }));
            }
        }

        this.params.internet = {
            connected: {title: _('Connected'), value: false, realIp: realIp, realCountry: realCountry},
            uptime: {title: _('Uptime'), value: '-'},
            protocol: {title: _('Protocol'), value: '-'},
            addrsv4: {title: _('IPv4'), value: ['-']},
            gatewayv4: {title: _('Gateway'), value: '-'},
            dnsv4: {title: _('DNSv4'), value: ['-']}
        };

        this.renderUpdateWanData(data[0], isRealInternet);
        return this.renderHtml(this.params.internet, 'internet');
    },

    _buildDateStr: function(unixtime) {
        if (!unixtime) return null;
        var date = new Date(unixtime * 1000);
        var zn = (uci.get('system', '@system[0]', 'zonename') || 'UTC').replace(/ /g, '_');
        var ts = uci.get('system', '@system[0]', 'clock_timestyle') || 0;
        var hc = uci.get('system', '@system[0]', 'clock_hourcycle') || 0;
        return new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: (ts == 0) ? 'long' : 'full',
            hourCycle: (hc == 0) ? undefined : hc,
            timeZone: zn
        }).format(date);
    },

    renderRouterBox: function(data) {
        var boardinfo = data[2];
        var systeminfo = data[3];
        var unixtime = data[4] || Math.floor(Date.now() / 1000);
        var datestr = this._buildDateStr(unixtime);

        this.params.router = {
            uptime: {title: _('Uptime'), value: systeminfo.uptime ? '%t'.format(systeminfo.uptime) : null},
            localtime: {title: _('Local Time'), value: datestr},
            kernel: {title: _('Kernel Version'), value: boardinfo.kernel},
            model: {title: _('Model'), value: boardinfo.model},
            system: {title: _('Architecture'), value: boardinfo.system},
            release: {title: _('Firmware Version'), value: boardinfo && boardinfo.release ? boardinfo.release.description : '-'}
        };

        var routerBox = this.renderHtml(this.params.router, 'router');

        this.last_cpu_perc = this.last_cpu_perc || 0;
        this.last_cpu_temp = this.last_cpu_temp || '--';
        this.last_ram_perc = this.last_ram_perc || 0;
        this.last_rom_perc = this.last_rom_perc || 0;
        this.last_rom_used_mb = this.last_rom_used_mb || '...';
        this.last_rom_total_mb = this.last_rom_total_mb || '...';

        var createCpuCircle = function(perc, label, temp) {
            var offset = 251.2 - (perc / 100) * 251.2;
            var container = document.createElement('div');
            container.className = 'circle-wrapper cpu';
            container.innerHTML = '<svg viewBox="0 0 100 100" class="circular-chart"><circle class="circle-bg" cx="50" cy="50" r="40" /><circle class="circle-value" cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="' + offset + '" /></svg><div class="circle-text cpu-stacked"><span class="cpu-perc">' + perc + '%</span><span class="cpu-temp">' + temp + '&deg;</span></div><div class="circle-label">' + label + '</div>';
            return container;
        };

        var createCircle = function(perc, label, colorClass) {
            var offset = 251.2 - (perc / 100) * 251.2;
            var container = document.createElement('div');
            container.className = 'circle-wrapper ' + colorClass;
            container.innerHTML = '<svg viewBox="0 0 100 100" class="circular-chart"><circle class="circle-bg" cx="50" cy="50" r="40" /><circle class="circle-value" cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="' + offset + '" /></svg><div class="circle-text">' + perc + '%</div><div class="circle-label">' + label + '</div>';
            return container;
        };

        var createRomCircle = function(perc, label, usedMB, totalMB) {
            var offset = 251.2 - (perc / 100) * 251.2;
            var container = document.createElement('div');
            container.className = 'circle-wrapper rom';
            container.innerHTML = '<svg viewBox="0 0 100 100" class="circular-chart"><circle class="circle-bg" cx="50" cy="50" r="40" /><circle class="circle-value" cx="50" cy="50" r="40" stroke-dasharray="251.2" stroke-dashoffset="' + offset + '" /></svg><div class="circle-text rom-stacked"><span class="rom-used">' + usedMB + 'M</span><span class="rom-divider"></span><span class="rom-total">' + totalMB + 'M</span></div><div class="circle-label">' + label + '</div>';
            return container;
        };

        var resourcesDiv = document.createElement('div');
        resourcesDiv.className = 'resources-container';
        resourcesDiv.appendChild(createCpuCircle(this.last_cpu_perc, 'CPU LOAD', this.last_cpu_temp));
        resourcesDiv.appendChild(createCircle(this.last_ram_perc, 'RAM USAGE', 'ram'));
        resourcesDiv.appendChild(createRomCircle(this.last_rom_perc, 'STORAGE', this.last_rom_used_mb, this.last_rom_total_mb));

        var infoBox = routerBox.querySelector('.router-status-info');
        if (infoBox) {
            infoBox.appendChild(E('hr'));
            infoBox.appendChild(resourcesDiv);
        }

        return routerBox;
    },

    _updateResourcesDOM: function() {
        var self = this;

        var cpuValEl = document.querySelector('.circle-wrapper.cpu .circle-value');
        var cpuPercEl = document.querySelector('.circle-wrapper.cpu .cpu-perc');
        var cpuTempEl = document.querySelector('.circle-wrapper.cpu .cpu-temp');
        if (cpuValEl) {
            cpuValEl.setAttribute('stroke-dashoffset', 251.2 - (self.last_cpu_perc / 100) * 251.2);
        }
        if (cpuPercEl) cpuPercEl.textContent = self.last_cpu_perc + '%';
        if (cpuTempEl) {
            var tVal = parseInt(self.last_cpu_temp, 10);
            var tColor = 'rgba(255, 255, 255, 0.7)';
            if (!isNaN(tVal)) {
                if (tVal >= 75) tColor = '#ff3333';
                else if (tVal >= 60) tColor = '#ff9900';
                else tColor = '#a1ff0a';
            }
            cpuTempEl.innerHTML = self.last_cpu_temp + '&deg;';
            cpuTempEl.style.color = tColor;
        }

        var romValEl = document.querySelector('.circle-wrapper.rom .circle-value');
        var romUsedEl = document.querySelector('.circle-wrapper.rom .rom-used');
        var romTotalEl = document.querySelector('.circle-wrapper.rom .rom-total');
        if (romValEl) {
            romValEl.setAttribute('stroke-dashoffset', 251.2 - (self.last_rom_perc / 100) * 251.2);
        }
        if (romUsedEl) romUsedEl.textContent = self.last_rom_used_mb + 'M';
        if (romTotalEl) romTotalEl.textContent = self.last_rom_total_mb + 'M';

        var ramValEl = document.querySelector('.circle-wrapper.ram .circle-value');
        var ramTextEl = document.querySelector('.circle-wrapper.ram .circle-text');
        if (ramValEl) {
            ramValEl.setAttribute('stroke-dashoffset', 251.2 - (self.last_ram_perc / 100) * 251.2);
        }
        if (ramTextEl) ramTextEl.textContent = self.last_ram_perc + '%';
    },

    startPolling: function() {
        if (this._pollingStarted) return;
        this._pollingStarted = true;

        var self = this;

        // ═══════════════════════════════════════════════
        // Timer 1: CPU / RAM / ROM — Every 1 Second
        // ═══════════════════════════════════════════════
        var updateResources = function() {
            if (!self._isDashboardAlive()) return;

            if (!self._isDashboardVisible()) {
                setTimeout(updateResources, 1000);
                return;
            }

            if (self._resourceLock) {
                setTimeout(updateResources, 1000);
                return;
            }
            self._resourceLock = true;

            fetch('/cgi-bin/system_resources?t=' + Date.now())
                .then(function(res) { return res.json(); })
                .then(function(sysRes) {
                    if (sysRes.cpu) {
                        var match = sysRes.cpu.match(/^cpu\s+(.*)$/m);
                        if (match) {
                            var p = match[1].trim().split(/\s+/).map(Number);
                            var total = p.reduce(function(a, b) { return a + b; }, 0);
                            var idle = p[3] + (p[4] || 0);
                            if (self.prev_cpu_stat) {
                                var total_diff = total - self.prev_cpu_stat.total;
                                var idle_diff = idle - self.prev_cpu_stat.idle;
                                if (total_diff > 0) {
                                    self.last_cpu_perc = Math.floor((total_diff - idle_diff) / total_diff * 100);
                                }
                            }
                            self.prev_cpu_stat = { total: total, idle: idle };
                        }
                    }
                    if (sysRes.cpu_temp) self.last_cpu_temp = sysRes.cpu_temp;
                    if (sysRes.mem_total && sysRes.mem_avail) {
                        var mt = parseInt(sysRes.mem_total, 10);
                        var ma = parseInt(sysRes.mem_avail, 10);
                        if (mt > 0) self.last_ram_perc = Math.floor(((mt - ma) / mt) * 100);
                    }
                    if (sysRes.rom_perc) {
                        var rn = parseInt(sysRes.rom_perc, 10);
                        if (!isNaN(rn)) self.last_rom_perc = rn;
                    }
                    if (sysRes.rom_avail && sysRes.rom_total) {
                        var ak = parseInt(sysRes.rom_avail, 10);
                        var tk = parseInt(sysRes.rom_total, 10);
                        if (!isNaN(ak) && !isNaN(tk) && tk > 0) {
                            self.last_rom_used_mb = ((tk - ak) / 1024).toFixed(1);
                            self.last_rom_total_mb = (tk / 1024).toFixed(1);
                        }
                    }
                    self._updateResourcesDOM();
                })
                .catch(function() {})
                .finally(function() {
                    self._resourceLock = false;
                    if (self._isDashboardAlive()) setTimeout(updateResources, 1000);
                });
        };
        setTimeout(updateResources, 1000);

        // ═══════════════════════════════════════════════
        // Timer 2: Internet Status — Every 5 Seconds
        // (internet_check + real_ip + WAN info)
        // DOM Patching: update text values only, no rebuild
        // ═══════════════════════════════════════════════
        var updateInternet = function() {
            if (!self._isDashboardAlive()) return;

            if (!self._isDashboardVisible()) {
                setTimeout(updateInternet, 5000);
                return;
            }

            if (self._internetLock) {
                setTimeout(updateInternet, 5000);
                return;
            }
            self._internetLock = true;

            Promise.all([
                network.getWANNetworks(),
                fetch('/cgi-bin/internet_check').then(function(r) { return r.text(); }).catch(function() { return 'false'; }),
                fetch('/cgi-bin/real_ip').then(function(r) { return r.text(); }).catch(function() { return '-'; })
            ]).then(function(results) {
                var isRealInternet = results[1] ? results[1].trim() === 'true' : false;
                var realIp = '-', realCountry = '';
                if (results[2] && results[2].trim() !== '') {
                    var parts = results[2].trim().split('|');
                    realIp = parts[0] || '-';
                    if (parts[1]) {
                        var cc = parts[1].toUpperCase();
                        realCountry = String.fromCodePoint.apply(null, Array.from(cc).map(function(c) { return 0x1F1E6 + c.charCodeAt(0) - 0x41; }));
                    }
                }

                self.renderUpdateWanData(results[0], isRealInternet);
                self.params.internet.connected.realIp = realIp;
                self.params.internet.connected.realCountry = realCountry;

                var box = document.querySelector('.internet-status-self');
                if (!box) return;

                // Update icon
                var icon = box.querySelector('.title img');
                if (icon) {
                    var iconName = isRealInternet ? 'internet' : 'not-internet';
                    icon.src = L.resource('view/dashboard/icons/' + iconName + '.svg');
                    icon.className = isRealInternet ? 'middle' : 'middle svgmonotone';
                }

                // Update connected status + real IP
                var connRow = box.querySelector('[data-field="connected"]');
                if (connRow) {
                    var cSpans = connRow.querySelectorAll(':scope > span');
                    if (cSpans.length >= 2) {
                        cSpans[1].textContent = isRealInternet ? _('yes') : _('no');
                        cSpans[1].className = isRealInternet ? 'label label-success' : 'label label-danger';
                    }
                    if (realIp && realIp !== '-') {
                        var flagText = realCountry ? ' ' + realCountry : '';
                        if (cSpans.length >= 3) {
                            cSpans[2].textContent = realIp + flagText;
                            cSpans[2].style.display = '';
                        } else {
                            connRow.style.cssText = 'flex-direction:row !important; justify-content:space-between; align-items:center;';
                            connRow.appendChild(E('span', {style: 'margin-left:auto; font-weight:600; color:#00ffff; font-size:11px; font-family:monospace; background:rgba(0,0,0,0.3); padding:2px 8px; border-radius:12px; border:1px solid rgba(0,255,255,0.2); text-shadow:0 0 5px rgba(0,255,255,0.2);'}, [realIp + flagText]));
                        }
                    } else if (cSpans.length >= 3) {
                        cSpans[2].style.display = 'none';
                    }
                }

                // Update uptime
                var uptimeRow = box.querySelector('[data-field="uptime"]');
                if (uptimeRow) {
                    var uSpan = uptimeRow.querySelector('span:last-child');
                    if (uSpan) uSpan.textContent = self.params.internet.uptime.value;
                }

                // Update protocol
                var protoRow = box.querySelector('[data-field="protocol"]');
                if (protoRow) {
                    var pSpan = protoRow.querySelector('span:last-child');
                    if (pSpan) {
                        var pv = self.params.internet.protocol.value;
                        if (typeof pv === 'object' && pv.nodeType) {
                            pSpan.textContent = '';
                            pSpan.appendChild(pv);
                        } else {
                            pSpan.textContent = String(pv || '-');
                        }
                    }
                }

                // Update IPv4
                var ipRow = box.querySelector('[data-field="addrsv4"]');
                if (ipRow) {
                    var ipSpan = ipRow.querySelector('span:last-child');
                    if (ipSpan) {
                        var addrs = self.params.internet.addrsv4.value;
                        ipSpan.textContent = (Array.isArray(addrs) && addrs.length) ? addrs[0].split('/')[0] : '-';
                    }
                }

                // Update gateway
                var gwRow = box.querySelector('[data-field="gatewayv4"]');
                if (gwRow) {
                    var gwSpan = gwRow.querySelector('span:last-child');
                    if (gwSpan) gwSpan.textContent = self.params.internet.gatewayv4.value;
                }

                // Update DNS
                var dnsEl = box.querySelector('[data-field="dnsv4"]');
                if (dnsEl) {
                    var dnsVals = self.params.internet.dnsv4.value || ['-'];
                    var dnsTitle = self.params.internet.dnsv4.title;
                    while (dnsEl.firstChild) dnsEl.removeChild(dnsEl.firstChild);
                    if (Array.isArray(dnsVals) && dnsVals.length > 0) {
                        dnsVals.forEach(function(val) {
                            dnsEl.appendChild(E('tr', {}, [E('td', {}, [dnsTitle + ': ']), E('td', {}, [val])]));
                        });
                    } else {
                        dnsEl.appendChild(E('tr', {}, [E('td', {}, [dnsTitle + ': ']), E('td', {}, ['-'])]));
                    }
                }
            }).catch(function() {})
            .finally(function() {
                self._internetLock = false;
                if (self._isDashboardAlive()) setTimeout(updateInternet, 5000);
            });
        };
        setTimeout(updateInternet, 5000);

        // ═══════════════════════════════════════════════
        // Timer 3: System Info — Every 30 Seconds
        // (Uptime, Local Time)
        // ═══════════════════════════════════════════════
        var updateSystemInfo = function() {
            if (!self._isDashboardAlive()) return;

            if (!self._isDashboardVisible()) {
                setTimeout(updateSystemInfo, 30000);
                return;
            }

            Promise.all([
                L.resolveDefault(callSystemInfo(), {}),
                L.resolveDefault(callGetUnixtime(), 0)
            ]).then(function(results) {
                var sysInfo = results[0];
                var unixtime = results[1] || Math.floor(Date.now() / 1000);
                var settingsInfo = document.querySelector('.router-status-self .settings-info');
                if (!settingsInfo) return;

                var spans = settingsInfo.querySelectorAll('.mt-2 > span:first-child');
                for (var i = 0; i < spans.length; i++) {
                    var valSpan = spans[i].nextElementSibling;
                    if (!valSpan) continue;
                    if (spans[i].textContent === _('Uptime') + ': ') {
                        valSpan.textContent = sysInfo.uptime ? '%t'.format(sysInfo.uptime) : '-';
                    } else if (spans[i].textContent === _('Local Time') + ': ') {
                        valSpan.textContent = self._buildDateStr(unixtime) || '-';
                    }
                }
            }).catch(function() {})
            .finally(function() {
                if (self._isDashboardAlive()) setTimeout(updateSystemInfo, 30000);
            });
        };
        setTimeout(updateSystemInfo, 30000);
    },

    render: function(data) {
        return [
            this.renderInternetBox(data),
            this.renderRouterBox(data)
        ];
    }
});
