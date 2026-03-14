Name:           tachibana
Version:        %{_version}
Release:        1
Summary:        Multi-platform iOS device manipulation suite
License:        Proprietary
URL:            https://github.com/Paranoid-AF/tachibana

AutoReqProv:    no
Requires:       libusb1

%description
Tachibana is a multi-platform iOS device manipulation suite providing
a server for device management and a CLI for ADB-style iDevice control.

%install
mkdir -p %{buildroot}/opt/tachibana
cp -a %{_sourcedir}/staging/* %{buildroot}/opt/tachibana/
mkdir -p %{buildroot}/etc/systemd/system
cp %{_sourcedir}/tachibana-server.service %{buildroot}/etc/systemd/system/

%files
/opt/tachibana
/etc/systemd/system/tachibana-server.service

%post
%systemd_post tachibana-server.service

%preun
%systemd_preun tachibana-server.service

%postun
%systemd_postun_with_restart tachibana-server.service
