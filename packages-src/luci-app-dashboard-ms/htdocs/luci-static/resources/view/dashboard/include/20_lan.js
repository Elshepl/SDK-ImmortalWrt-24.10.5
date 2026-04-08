'use strict';
'require baseclass';
'require rpc';
'require network';

var callLuciDHCPLeases = rpc.declare({object: 'luci-rpc', method: 'getDHCPLeases', expect: {'': {}}});

return baseclass.extend({
    title: _('DHCP Devices'),
    params: {},

    _isDashboardAlive: function() {
        return document.getElementById('dashboard-active-marker') !== null;
    },

    _isDashboardVisible: function() {
        return this._isDashboardAlive() && document.visibilityState === 'visible';
    },

    load: function() {
        return Promise.all([callLuciDHCPLeases()]);
    },

    _buildTable: function() {
        var container_devices = E('table', {'class': 'table assoclist devices-info'}, [
            E('thead', {'class': 'thead dashboard-bg'}, [
                E('th', {'class': 'th nowrap'}, _('Hostname')),
                E('th', {'class': 'th'}, _('IP Address'))
            ])
        ]);

        for (var idx = 0; idx < this.params.lan.devices.length; idx++) {
            var device = this.params.lan.devices[idx];
            container_devices.appendChild(E('tr', {'class': idx % 2 ? 'tr cbi-rowstyle-2' : 'tr cbi-rowstyle-1'}, [
                E('td', {'class': 'td device-info'}, [
                    E('div', {'style': 'display:flex; flex-direction:column; gap:3px;'}, [
                        E('span', {'style': 'font-weight:600; color:#00ffff; font-size:12px;'}, [device.hostname]),
                        E('span', {'style': 'font-size:10px; color:#94a3b8; font-family:monospace; background:rgba(0,0,0,0.25); padding:2px 6px; border-radius:4px; width:max-content; border:1px solid rgba(255,255,255,0.05);'}, [device.macaddr])
                    ])
                ]),
                E('td', {'class': 'td device-info'}, [
                    E('p', {}, [E('span', {'style': 'font-weight:bold; color:#f1f5f9; font-size:12px;'}, [device.ipv4])])
                ])
            ]));
        }

        container_devices.appendChild(E('tfoot', {'class': 'tfoot dashboard-bg'}, [
            E('tr', {'class': 'tr cbi-rowstyle-1'}, [
                E('td', {'class': 'td device-info'}, [E('span', {'class': 'd-inline-block', 'style': 'font-weight:bold'}, [_('Total') + '：'])]),
                E('td', {'class': 'td device-info'}, [E('span', {'class': 'd-inline-block', 'style': 'font-weight:bold; color:#00ffff'}, [String(this.params.lan.devices.length)])])
            ])
        ]));

        return container_devices;
    },

    renderHtml: function() {
        var container_wapper = E('div', {'class': 'router-status-lan dashboard-bg box-s1'});
        var container_box = E('div', {'class': 'lan-info devices-list'});

        container_box.appendChild(E('div', {'class': 'title'}, [
            E('img', {'src': L.resource('view/dashboard/icons/devices.svg'), 'width': 55, 'title': this.title, 'class': 'middle svgmonotone'}),
            E('h3', this.title)
        ]));

        container_box.appendChild(this._buildTable());
        container_wapper.appendChild(container_box);
        return container_wapper;
    },

    renderUpdateData: function(leases) {
        var dev_arr = [];
        leases.forEach(function(item) {
            dev_arr.push({
                hostname: item.hostname || '?',
                ipv4: item.ipaddr || '-',
                macaddr: item.macaddr || '00:00:00:00:00:00'
            });
        });
        this.params.lan = { devices: dev_arr };
    },

    startPolling: function() {
        if (this._pollingStarted) return;
        this._pollingStarted = true;
        var self = this;

        var updateDHCP = function() {
            if (!self._isDashboardAlive()) return;

            if (!self._isDashboardVisible()) {
                setTimeout(updateDHCP, 30000);
                return;
            }

            callLuciDHCPLeases().then(function(leases) {
                self.renderUpdateData(leases.dhcp_leases || []);
                var lanBox = document.querySelector('.router-status-lan .devices-list');
                if (lanBox) {
                    var oldTable = lanBox.querySelector('table.assoclist');
                    if (oldTable) oldTable.remove();
                    lanBox.appendChild(self._buildTable());
                }
            }).catch(function() {})
            .finally(function() {
                if (self._isDashboardAlive()) setTimeout(updateDHCP, 30000);
            });
        };
        setTimeout(updateDHCP, 30000);
    },

    renderLeases: function(leases) {
        this.renderUpdateData(leases.dhcp_leases || []);
        return this.renderHtml();
    },

    render: function(data) {
        var leases = data[0];
        if (L.hasSystemFeature('dnsmasq') || L.hasSystemFeature('odhcpd'))
            return this.renderLeases(leases);
        return E([]);
    }
});