include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-dashboard-ms
PKG_VERSION:=1.0
PKG_RELEASE:=16

include $(INCLUDE_DIR)/package.mk

define Package/luci-app-dashboard-ms
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI Dashboard with Dynamic VPN Quota
  DEPENDS:=+luci-base +libiwinfo +curl
  PKGARCH:=all
endef

define Build/Compile
endef

define Package/luci-app-dashboard-ms/install
	# 1. إنشاء كل المجلدات المطلوبة في الراوتر (بصلاحيات 755)
	$(INSTALL_DIR) $(1)/www/cgi-bin
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/dashboard/include
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/dashboard/css
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/dashboard/icons
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d

	# 2. نقل ملفات الـ Root (المنيو والـ ACL والباك-أند)
	[ -d ./root/usr ] && $(CP) ./root/usr/* $(1)/usr/
	[ -d ./root/www ] && $(CP) ./root/www/* $(1)/www/
	
	# ضبط صلاحيات سكريبتات الباش (لازم كل الـ cgi-bin يكون قابل للتنفيذ 755)
	chmod 755 $(1)/www/cgi-bin/*

	# 3. نقل ملفات الواجهة (htdocs)
	$(CP) ./htdocs/luci-static/resources/view/dashboard/index.js $(1)/www/luci-static/resources/view/dashboard/
	$(CP) ./htdocs/luci-static/resources/view/dashboard/include/* $(1)/www/luci-static/resources/view/dashboard/include/
	$(CP) ./htdocs/luci-static/resources/view/dashboard/css/* $(1)/www/luci-static/resources/view/dashboard/css/
	$(CP) ./htdocs/luci-static/resources/view/dashboard/icons/* $(1)/www/luci-static/resources/view/dashboard/icons/

	# 4. الحل السحري لخطأ 403 (ضبط صلاحيات ملفات الواجهة لـ 644 حتى يقرأها المتصفح)
	find $(1)/www/luci-static/ -type f -exec chmod 644 {} +
	find $(1)/usr/share/luci/menu.d/ -type f -exec chmod 644 {} +
endef

$(eval $(call BuildPackage,luci-app-dashboard-ms))

