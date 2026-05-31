(function () {
    const SESSION_KEY = 'siteAdminSession';
    const UNLOCK_KEY = 'siteAdminUnlock';
    const FILE_SHA_KEY = 'siteContentSha';
    const CONFIG_SHA_KEY = 'siteConfigSha';
    const CONFIG_PATH = 'admin/config.js';

    let siteData = null;
    let activeTab = 'home';
    let sessionPassword = null;
    let sessionToken = null;

    function getActiveToken() {
        return sessionToken || '';
    }

    function bufferToBase64(buffer) {
        return btoa(String.fromCharCode(...new Uint8Array(buffer)));
    }

    function base64ToBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    async function deriveKey(password, saltBuffer) {
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        return crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt: saltBuffer, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptToken(token, password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const key = await deriveKey(password, salt);
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            new TextEncoder().encode(token)
        );
        return {
            salt: bufferToBase64(salt),
            iv: bufferToBase64(iv),
            data: bufferToBase64(encrypted)
        };
    }

    async function decryptToken(encryptedToken, password) {
        if (!encryptedToken?.data) return '';
        const salt = base64ToBuffer(encryptedToken.salt);
        const iv = base64ToBuffer(encryptedToken.iv);
        const data = base64ToBuffer(encryptedToken.data);
        const key = await deriveKey(password, salt);
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, data);
        return new TextDecoder().decode(decrypted);
    }

    async function loadAdminConfig() {
        const response = await fetch(`config.js?t=${Date.now()}`);
        if (!response.ok) throw new Error('Could not load admin config.');
        const source = await response.text();
        window.ADMIN_CONFIG = null;
        // eslint-disable-next-line no-new-func
        new Function(source)();
        if (!window.ADMIN_CONFIG) throw new Error('Admin config is invalid.');
    }

    async function unlockSession(password) {
        sessionPassword = password;
        sessionStorage.setItem(UNLOCK_KEY, password);
        sessionToken = '';
        if (window.ADMIN_CONFIG.encryptedToken) {
            try {
                sessionToken = await decryptToken(window.ADMIN_CONFIG.encryptedToken, password);
            } catch {
                sessionToken = '';
            }
        }
    }

    function lockSession() {
        sessionPassword = null;
        sessionToken = null;
        sessionStorage.removeItem(UNLOCK_KEY);
        sessionStorage.removeItem(SESSION_KEY);
    }

    async function sha256(message) {
        const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(message));
        return Array.from(new Uint8Array(buffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
    }

    function showStatus(message, type = 'info') {
        const bar = document.getElementById('status-bar');
        bar.textContent = message;
        bar.className = `status-bar visible ${type}`;
    }

    function hideStatus() {
        document.getElementById('status-bar').className = 'status-bar';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    function isLoggedIn() {
        return sessionStorage.getItem(SESSION_KEY) === 'true';
    }

    function showApp() {
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('admin-app').classList.remove('hidden');
    }

    function showLogin() {
        document.getElementById('login-screen').classList.remove('hidden');
        document.getElementById('admin-app').classList.add('hidden');
    }

    async function handleLogin(event) {
        event.preventDefault();
        const password = document.getElementById('password').value;
        const errorEl = document.getElementById('login-error');

        try {
            await loadAdminConfig();
        } catch (err) {
            errorEl.textContent = err.message;
            errorEl.classList.remove('hidden');
            return;
        }

        const hash = await sha256(password);

        if (hash === window.ADMIN_CONFIG.passwordHash) {
            sessionStorage.setItem(SESSION_KEY, 'true');
            await unlockSession(password);
            errorEl.classList.add('hidden');
            await loadContent();
            showApp();
            renderEditor();
        } else {
            errorEl.textContent = 'Incorrect password.';
            errorEl.classList.remove('hidden');
        }
    }

    function handleLogout() {
        lockSession();
        showLogin();
        document.getElementById('password').value = '';
    }

    async function loadContent() {
        const response = await fetch(`../${window.ADMIN_CONFIG.contentPath}?t=${Date.now()}`);
        if (!response.ok) throw new Error('Could not load site content.');
        siteData = await response.json();
    }

    function field(label, id, value, type = 'text', rows) {
        if (type === 'textarea') {
            return `
                <div class="field-group">
                    <label for="${id}">${label}</label>
                    <textarea id="${id}" data-field="${id}" rows="${rows || 3}">${escapeHtml(value)}</textarea>
                </div>`;
        }
        return `
            <div class="field-group">
                <label for="${id}">${label}</label>
                <input type="${type}" id="${id}" data-field="${id}" value="${escapeHtml(value)}">
            </div>`;
    }

    function bindFields(container, onChange) {
        container.querySelectorAll('[data-field]').forEach((el) => {
            el.addEventListener('input', onChange);
            el.addEventListener('change', onChange);
        });
    }

    function getVal(id) {
        return document.getElementById(id)?.value ?? '';
    }

    function hasField(id) {
        return !!document.getElementById(id);
    }

    function renderHomeEditor() {
        const h = siteData.home.hero;
        return `
            <h2 class="section-title">Home Page</h2>
            ${field('Name / Title', 'home-hero-title', h.title)}
            ${field('Subtitle', 'home-hero-subtitle', h.subtitle)}
            ${field('Bio', 'home-hero-bio', h.bio, 'textarea', 3)}
            ${field('Profile Image Path', 'home-hero-image', h.profileImage)}
            <div class="field-row">
                ${field('Button Text', 'home-hero-cta-text', h.ctaText)}
                ${field('Button Link', 'home-hero-cta-link', h.ctaLink)}
            </div>
            <h3 style="margin: 2rem 0 1rem;">Feature Sections</h3>
            ${siteData.home.sections.map((section, i) => `
                <div class="list-item">
                    <div class="list-item-header">
                        <strong>Section ${i + 1}: ${escapeHtml(section.title)}</strong>
                    </div>
                    ${field(`Title`, `home-section-${i}-title`, section.title)}
                    ${field(`Subtitle`, `home-section-${i}-subtitle`, section.subtitle)}
                    ${field(`Body`, `home-section-${i}-body`, section.body, 'textarea', 4)}
                    ${field(`Image Path`, `home-section-${i}-image`, section.image)}
                    <div class="field-row">
                        ${field(`Link Text`, `home-section-${i}-linkText`, section.linkText)}
                        ${field(`Link URL`, `home-section-${i}-linkHref`, section.linkHref)}
                    </div>
                    <div class="checkbox-row">
                        <input type="checkbox" id="home-section-${i}-grayBg" ${section.grayBg ? 'checked' : ''}>
                        <label for="home-section-${i}-grayBg">Gray background</label>
                    </div>
                    <div class="checkbox-row">
                        <input type="checkbox" id="home-section-${i}-imageFirst" ${section.imageFirst ? 'checked' : ''}>
                        <label for="home-section-${i}-imageFirst">Image on left</label>
                    </div>
                </div>`).join('')}`;
    }

    function syncHome() {
        if (!hasField('home-hero-title')) return;
        siteData.home.hero.title = getVal('home-hero-title');
        siteData.home.hero.subtitle = getVal('home-hero-subtitle');
        siteData.home.hero.bio = getVal('home-hero-bio');
        siteData.home.hero.profileImage = getVal('home-hero-image');
        siteData.home.hero.ctaText = getVal('home-hero-cta-text');
        siteData.home.hero.ctaLink = getVal('home-hero-cta-link');

        siteData.home.sections.forEach((section, i) => {
            section.title = getVal(`home-section-${i}-title`);
            section.subtitle = getVal(`home-section-${i}-subtitle`);
            section.body = getVal(`home-section-${i}-body`);
            section.image = getVal(`home-section-${i}-image`);
            section.linkText = getVal(`home-section-${i}-linkText`);
            section.linkHref = getVal(`home-section-${i}-linkHref`);
            section.grayBg = document.getElementById(`home-section-${i}-grayBg`)?.checked ?? false;
            section.imageFirst = document.getElementById(`home-section-${i}-imageFirst`)?.checked ?? false;
        });
    }

    function renderAboutEditor() {
        const a = siteData.about;
        return `
            <h2 class="section-title">About Page</h2>
            <div class="field-row">
                ${field('Page Title', 'about-header-title', a.header.title)}
                ${field('Page Subtitle', 'about-header-subtitle', a.header.subtitle)}
            </div>
            ${field('Banner Text', 'about-banner', a.banner, 'textarea', 3)}
            <h3 style="margin: 2rem 0 1rem;">Education</h3>
            ${a.education.map((row, i) => `
                <div class="list-item">
                    <div class="list-item-header"><strong>Entry ${i + 1}</strong>
                        <button type="button" class="btn btn-danger btn-sm" data-remove-education="${i}">Remove</button>
                    </div>
                    ${field('Institution', `edu-${i}-institution`, row.institution)}
                    <div class="field-row">
                        ${field('Location', `edu-${i}-location`, row.location)}
                        ${field('Years', `edu-${i}-years`, row.years)}
                    </div>
                </div>`).join('')}
            <button type="button" class="btn btn-secondary" id="add-education">+ Add Education</button>
            <h3 style="margin: 2rem 0 1rem;">Certifications</h3>
            ${a.certifications.map((row, i) => `
                <div class="list-item">
                    <div class="list-item-header"><strong>Cert ${i + 1}</strong>
                        <button type="button" class="btn btn-danger btn-sm" data-remove-cert="${i}">Remove</button>
                    </div>
                    ${field('Name', `cert-${i}-name`, row.name)}
                    ${field('Organization', `cert-${i}-organization`, row.organization)}
                </div>`).join('')}
            <button type="button" class="btn btn-secondary" id="add-cert">+ Add Certification</button>
            <h3 style="margin: 2rem 0 1rem;">Volunteer Experience</h3>
            ${field('Title', 'volunteer-title', a.volunteer.title)}
            ${field('Organization & Dates', 'volunteer-org', a.volunteer.org)}
            ${field('Description', 'volunteer-description', a.volunteer.description, 'textarea', 4)}
            ${field('Image Path', 'volunteer-image', a.volunteer.image)}`;
    }

    function syncAbout() {
        if (!hasField('about-header-title')) return;
        siteData.about.header.title = getVal('about-header-title');
        siteData.about.header.subtitle = getVal('about-header-subtitle');
        siteData.about.banner = getVal('about-banner');

        siteData.about.education = siteData.about.education.map((_, i) => ({
            institution: getVal(`edu-${i}-institution`),
            location: getVal(`edu-${i}-location`),
            years: getVal(`edu-${i}-years`)
        }));

        siteData.about.certifications = siteData.about.certifications.map((_, i) => ({
            name: getVal(`cert-${i}-name`),
            organization: getVal(`cert-${i}-organization`)
        }));

        siteData.about.volunteer = {
            title: getVal('volunteer-title'),
            org: getVal('volunteer-org'),
            description: getVal('volunteer-description'),
            image: getVal('volunteer-image')
        };
    }

    function renderMedEditor() {
        const m = siteData.med;
        return `
            <h2 class="section-title">Medical & Publications</h2>
            <div class="field-row">
                ${field('Page Title', 'med-header-title', m.header.title)}
                ${field('Page Subtitle', 'med-header-subtitle', m.header.subtitle)}
            </div>
            ${field('About Paragraphs (one per line)', 'med-about', m.about.paragraphs.join('\n'), 'textarea', 5)}
            <h3 style="margin: 2rem 0 1rem;">Publications</h3>
            <div id="publications-editor">
                ${m.publications.map((pub, i) => publicationItem(pub, i)).join('')}
            </div>
            <button type="button" class="btn btn-secondary" id="add-publication">+ Add Publication</button>`;
    }

    function publicationItem(pub, i) {
        return `
            <div class="list-item" data-pub-index="${i}">
                <div class="list-item-header">
                    <strong>Publication ${i + 1}</strong>
                    <div class="list-item-actions">
                        <button type="button" class="btn btn-secondary btn-sm" data-move-up="${i}" ${i === 0 ? 'disabled' : ''}>&uarr;</button>
                        <button type="button" class="btn btn-secondary btn-sm" data-move-down="${i}" ${i === siteData.med.publications.length - 1 ? 'disabled' : ''}>&darr;</button>
                        <button type="button" class="btn btn-danger btn-sm" data-remove-pub="${i}">Remove</button>
                    </div>
                </div>
                ${field('Title', `pub-${i}-title`, pub.title)}
                ${field('Journal & Date', `pub-${i}-journal`, pub.journal)}
                ${field('Description', `pub-${i}-description`, pub.description, 'textarea', 5)}
                ${field('URL', `pub-${i}-url`, pub.url, 'url')}
                <div class="checkbox-row">
                    <input type="checkbox" id="pub-${i}-firstAuthor" ${pub.firstAuthor ? 'checked' : ''}>
                    <label for="pub-${i}-firstAuthor">First Author</label>
                </div>
            </div>`;
    }

    function syncMed() {
        if (!hasField('med-header-title')) return;
        siteData.med.header.title = getVal('med-header-title');
        siteData.med.header.subtitle = getVal('med-header-subtitle');
        siteData.med.about.paragraphs = getVal('med-about').split('\n').map((p) => p.trim()).filter(Boolean);

        siteData.med.publications = siteData.med.publications.map((pub, i) => ({
            id: pub.id || `pub-${Date.now()}-${i}`,
            title: getVal(`pub-${i}-title`),
            journal: getVal(`pub-${i}-journal`),
            description: getVal(`pub-${i}-description`),
            url: getVal(`pub-${i}-url`),
            firstAuthor: document.getElementById(`pub-${i}-firstAuthor`)?.checked ?? false
        }));
    }

    function renderBusinessEditor() {
        const b = siteData.business;
        return `
            <h2 class="section-title">Business Page</h2>
            <div class="field-row">
                ${field('Page Title', 'biz-header-title', b.header.title)}
                ${field('Page Subtitle', 'biz-header-subtitle', b.header.subtitle)}
            </div>
            <h3 style="margin: 2rem 0 1rem;">Vue Billboards</h3>
            ${field('Title', 'vue-title', b.vue.title)}
            ${field('Subtitle', 'vue-subtitle', b.vue.subtitle)}
            ${field('Owner Note', 'vue-owner', b.vue.ownerNote)}
            ${field('Bullet Points (one per line)', 'vue-bullets', b.vue.bullets.join('\n'), 'textarea', 5)}
            ${field('Website URL', 'vue-website', b.vue.websiteUrl, 'url')}
            ${field('Video Path', 'vue-video', b.vue.videoSrc)}
            <h3 style="margin: 2rem 0 1rem;">Elite Marketing</h3>
            ${field('Title', 'elite-title', b.elite.title)}
            ${field('Subtitle', 'elite-subtitle', b.elite.subtitle)}
            ${field('Body', 'elite-body', b.elite.body, 'textarea', 4)}
            ${field('Bullet Points (one per line)', 'elite-bullets', b.elite.bullets.join('\n'), 'textarea', 4)}
            ${field('Image Path', 'elite-image', b.elite.image)}
            ${field('Website URL', 'elite-website', b.elite.websiteUrl, 'url')}`;
    }

    function syncBusiness() {
        if (!hasField('biz-header-title')) return;
        siteData.business.header.title = getVal('biz-header-title');
        siteData.business.header.subtitle = getVal('biz-header-subtitle');
        siteData.business.vue = {
            title: getVal('vue-title'),
            subtitle: getVal('vue-subtitle'),
            ownerNote: getVal('vue-owner'),
            bullets: getVal('vue-bullets').split('\n').map((b) => b.trim()).filter(Boolean),
            websiteUrl: getVal('vue-website'),
            videoSrc: getVal('vue-video')
        };
        siteData.business.elite = {
            title: getVal('elite-title'),
            subtitle: getVal('elite-subtitle'),
            body: getVal('elite-body'),
            bullets: getVal('elite-bullets').split('\n').map((b) => b.trim()).filter(Boolean),
            image: getVal('elite-image'),
            websiteUrl: getVal('elite-website')
        };
    }

    function renderContactEditor() {
        const c = siteData.contact;
        return `
            <h2 class="section-title">Contact Page</h2>
            <div class="field-row">
                ${field('Page Title', 'contact-header-title', c.header.title)}
                ${field('Page Subtitle', 'contact-header-subtitle', c.header.subtitle)}
            </div>
            ${field('Intro Text', 'contact-intro', c.intro)}
            <div class="field-row">
                ${field('Email', 'contact-email', c.email, 'email')}
                ${field('Phone', 'contact-phone', c.phone, 'tel')}
            </div>
            <h3 style="margin: 2rem 0 1rem;">Footer</h3>
            <div class="field-row">
                ${field('Copyright Year', 'footer-year', siteData.footer.year, 'number')}
                ${field('Footer Email', 'footer-email', siteData.footer.email, 'email')}
            </div>`;
    }

    function syncContact() {
        if (!hasField('contact-header-title')) return;
        siteData.contact.header.title = getVal('contact-header-title');
        siteData.contact.header.subtitle = getVal('contact-header-subtitle');
        siteData.contact.intro = getVal('contact-intro');
        siteData.contact.email = getVal('contact-email');
        siteData.contact.phone = getVal('contact-phone');
        siteData.footer.year = parseInt(getVal('footer-year'), 10) || new Date().getFullYear();
        siteData.footer.email = getVal('footer-email');
    }

    function renderSettingsEditor() {
        const tokenSet = !!getActiveToken();
        return `
            <h2 class="section-title">Settings</h2>
            <div class="settings-note">
                To publish changes, add a GitHub token with <strong>Contents: Read and write</strong> on your repo.
                <a href="https://github.com/settings/tokens/new?scopes=repo&description=Brian%20Becker%20Site%20Admin" target="_blank" rel="noopener">Create a token &rarr;</a>
                Your token is encrypted with your admin password and saved in the repo — you only enter it once.
            </div>
            ${field('GitHub Token', 'github-token', '', 'password')}
            <p class="token-hint">${tokenSet ? '<span style="color: var(--admin-success);">✓</span> GitHub connected — token stored securely in your repo.' : 'Paste your token once. It will be encrypted and saved so you don\'t need to re-enter it.'}</p>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-top: 0.5rem;">
                <button type="button" class="btn btn-primary" id="save-token">${tokenSet ? 'Update Token &amp; Publish' : 'Connect &amp; Publish'}</button>
                ${tokenSet ? '<button type="button" class="btn btn-secondary" id="remove-token">Remove Saved Token</button>' : ''}
            </div>
            <h3 style="margin: 2rem 0 1rem;">Change Admin Password</h3>
            ${field('Current Password', 'current-password', '', 'password')}
            ${field('New Password', 'new-password', '', 'password')}
            ${field('Confirm Password', 'confirm-password', '', 'password')}
            <button type="button" class="btn btn-secondary" id="change-password">Update Password</button>
            <h3 style="margin: 2rem 0 1rem;">Download Backup</h3>
            <button type="button" class="btn btn-secondary" id="download-json">Download site.json</button>`;
    }

    function syncCurrentTab() {
        const syncers = { home: syncHome, about: syncAbout, med: syncMed, business: syncBusiness, contact: syncContact };
        if (syncers[activeTab]) syncers[activeTab]();
    }

    function renderPreview() {
        syncCurrentTab();
        const preview = document.getElementById('preview-panel');
        if (!preview) return;

        if (activeTab === 'home') {
            const h = siteData.home.hero;
            preview.innerHTML = `
                <h3>${escapeHtml(h.title)}</h3>
                <p class="subtitle">${escapeHtml(h.subtitle)}</p>
                <p>${escapeHtml(h.bio)}</p>
                ${siteData.home.sections.map((s) => `
                    <div class="preview-card">
                        <strong>${escapeHtml(s.title)}</strong>
                        <p class="subtitle">${escapeHtml(s.subtitle)}</p>
                        <p>${escapeHtml(s.body.slice(0, 120))}${s.body.length > 120 ? '…' : ''}</p>
                    </div>`).join('')}`;
        } else if (activeTab === 'med') {
            preview.innerHTML = siteData.med.publications.map((pub) => `
                <div class="preview-card">
                    ${pub.firstAuthor ? '<span class="badge">First Author</span>' : ''}
                    <h3>${escapeHtml(pub.title)}</h3>
                    <p class="subtitle"><em>${escapeHtml(pub.journal)}</em></p>
                    <p>${escapeHtml(pub.description.slice(0, 150))}${pub.description.length > 150 ? '…' : ''}</p>
                </div>`).join('');
        } else if (activeTab === 'about') {
            preview.innerHTML = `
                <h3>${escapeHtml(siteData.about.header.title)}</h3>
                <p>${escapeHtml(siteData.about.banner)}</p>
                <p><strong>Education:</strong> ${siteData.about.education.length} entries</p>
                <p><strong>Certifications:</strong> ${siteData.about.certifications.length} entries</p>`;
        } else if (activeTab === 'business') {
            preview.innerHTML = `
                <div class="preview-card"><strong>${escapeHtml(siteData.business.vue.title)}</strong><p class="subtitle">${escapeHtml(siteData.business.vue.subtitle)}</p></div>
                <div class="preview-card"><strong>${escapeHtml(siteData.business.elite.title)}</strong><p class="subtitle">${escapeHtml(siteData.business.elite.subtitle)}</p></div>`;
        } else if (activeTab === 'contact') {
            preview.innerHTML = `
                <h3>${escapeHtml(siteData.contact.header.title)}</h3>
                <p>${escapeHtml(siteData.contact.email)}</p>
                <p>${escapeHtml(siteData.contact.phone)}</p>`;
        } else {
            preview.innerHTML = '<p style="color: var(--admin-muted);">Configure your GitHub token to save changes.</p>';
        }
    }

    function renderEditor() {
        const editors = {
            home: renderHomeEditor,
            about: renderAboutEditor,
            med: renderMedEditor,
            business: renderBusinessEditor,
            contact: renderContactEditor,
            settings: renderSettingsEditor
        };

        const panel = document.getElementById('editor-panel');
        panel.innerHTML = editors[activeTab]();

        bindFields(panel, () => {
            syncCurrentTab();
            renderPreview();
        });

        bindEditorActions();
        renderPreview();
    }

    function bindEditorActions() {
        document.getElementById('add-publication')?.addEventListener('click', () => {
            syncMed();
            siteData.med.publications.push({
                id: `pub-${Date.now()}`,
                title: 'New Publication',
                journal: 'Journal Name, Date',
                description: 'Description of the publication.',
                url: 'https://',
                firstAuthor: false
            });
            renderEditor();
        });

        document.querySelectorAll('[data-remove-pub]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncMed();
                siteData.med.publications.splice(parseInt(btn.dataset.removePub, 10), 1);
                renderEditor();
            });
        });

        document.querySelectorAll('[data-move-up]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncMed();
                const i = parseInt(btn.dataset.moveUp, 10);
                [siteData.med.publications[i - 1], siteData.med.publications[i]] = [siteData.med.publications[i], siteData.med.publications[i - 1]];
                renderEditor();
            });
        });

        document.querySelectorAll('[data-move-down]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncMed();
                const i = parseInt(btn.dataset.moveDown, 10);
                [siteData.med.publications[i], siteData.med.publications[i + 1]] = [siteData.med.publications[i + 1], siteData.med.publications[i]];
                renderEditor();
            });
        });

        document.getElementById('add-education')?.addEventListener('click', () => {
            syncAbout();
            siteData.about.education.push({ institution: '', location: '', years: '' });
            renderEditor();
        });

        document.querySelectorAll('[data-remove-education]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncAbout();
                siteData.about.education.splice(parseInt(btn.dataset.removeEducation, 10), 1);
                renderEditor();
            });
        });

        document.getElementById('add-cert')?.addEventListener('click', () => {
            syncAbout();
            siteData.about.certifications.push({ name: '', organization: '' });
            renderEditor();
        });

        document.querySelectorAll('[data-remove-cert]').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncAbout();
                siteData.about.certifications.splice(parseInt(btn.dataset.removeCert, 10), 1);
                renderEditor();
            });
        });

        document.getElementById('save-token')?.addEventListener('click', async () => {
            let token = getVal('github-token').trim() || getActiveToken();
            if (!token) {
                showStatus('Paste a GitHub token first.', 'error');
                return;
            }

            showStatus('Verifying token…', 'info');

            try {
                const { repo } = window.ADMIN_CONFIG;
                const response = await fetch(`https://api.github.com/repos/${repo}`, {
                    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
                });

                if (!response.ok) {
                    throw new Error('Token invalid or missing repo access.');
                }

                if (!sessionPassword) {
                    throw new Error('Session expired. Log out and sign in again.');
                }

                const isNewToken = token !== getActiveToken();
                sessionToken = token;
                if (isNewToken) {
                    window.ADMIN_CONFIG.encryptedToken = await encryptToken(token, sessionPassword);
                    document.getElementById('github-token').value = '';
                    showStatus('Token encrypted and saved. Publishing your changes…', 'info');
                    await saveConfigToGitHub(token);
                } else {
                    showStatus('Publishing your changes…', 'info');
                }
                await publishToGitHub(token);
                renderEditor();
            } catch (err) {
                showStatus(err.message, 'error');
            }
        });

        document.getElementById('remove-token')?.addEventListener('click', async () => {
            const token = getActiveToken();
            if (!token) {
                showStatus('No token to remove.', 'error');
                return;
            }

            try {
                showStatus('Removing saved token…', 'info');
                sessionToken = '';
                window.ADMIN_CONFIG.encryptedToken = null;
                await saveConfigToGitHub(token);
                showStatus('GitHub token removed from repo.', 'success');
                renderEditor();
            } catch (err) {
                showStatus(err.message, 'error');
            }
        });

        document.getElementById('change-password')?.addEventListener('click', async () => {
            const current = getVal('current-password');
            const pw = getVal('new-password');
            const confirm = getVal('confirm-password');

            if (!current || !pw || pw !== confirm) {
                showStatus('Enter your current password and matching new passwords.', 'error');
                return;
            }

            const currentHash = await sha256(current);
            if (currentHash !== window.ADMIN_CONFIG.passwordHash) {
                showStatus('Current password is incorrect.', 'error');
                return;
            }

            const token = getActiveToken();
            if (!token) {
                showStatus('Connect a GitHub token first so the new password can be saved.', 'error');
                return;
            }

            try {
                showStatus('Updating password…', 'info');
                const newHash = await sha256(pw);
                window.ADMIN_CONFIG.passwordHash = newHash;
                if (sessionToken) {
                    window.ADMIN_CONFIG.encryptedToken = await encryptToken(sessionToken, pw);
                }
                sessionPassword = pw;
                sessionStorage.setItem(UNLOCK_KEY, pw);
                await saveConfigToGitHub(token);
                showStatus('Password updated and saved. Use your new password next time you log in.', 'success');
                document.getElementById('current-password').value = '';
                document.getElementById('new-password').value = '';
                document.getElementById('confirm-password').value = '';
            } catch (err) {
                showStatus(`Password update failed: ${err.message}`, 'error');
            }
        });

        document.getElementById('download-json')?.addEventListener('click', () => {
            syncCurrentTab();
            const blob = new Blob([JSON.stringify(siteData, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'site.json';
            a.click();
        });
    }

    function buildConfigFile() {
        const c = window.ADMIN_CONFIG;
        const encrypted = c.encryptedToken
            ? JSON.stringify(c.encryptedToken)
            : 'null';
        return `window.ADMIN_CONFIG = {
    passwordHash: '${c.passwordHash}',
    repo: '${c.repo}',
    branch: '${c.branch}',
    contentPath: '${c.contentPath}',
    encryptedToken: ${encrypted}
};
`;
    }

    async function getFileSha(token, path, shaKey) {
        const { repo, branch } = window.ADMIN_CONFIG;
        const url = `https://api.github.com/repos/${repo}/contents/${path}?ref=${branch}`;

        const response = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
        });

        if (response.status === 404) return null;
        if (!response.ok) throw new Error(`Could not fetch ${path} from GitHub.`);
        const data = await response.json();
        sessionStorage.setItem(shaKey, data.sha);
        return data.sha;
    }

    async function putFileToGitHub(token, path, textContent, message, shaKey) {
        const { repo, branch } = window.ADMIN_CONFIG;
        const sha = await getFileSha(token, path, shaKey);
        const content = btoa(unescape(encodeURIComponent(textContent)));

        const response = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ message, content, sha, branch })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.message || `Failed to save ${path}.`);
        }

        const result = await response.json();
        sessionStorage.setItem(shaKey, result.content.sha);
        return result;
    }

    async function saveConfigToGitHub(token) {
        return putFileToGitHub(
            token,
            CONFIG_PATH,
            buildConfigFile(),
            'Update admin password via admin portal',
            CONFIG_SHA_KEY
        );
    }

    async function publishToGitHub(token) {
        syncCurrentTab();
        const { contentPath } = window.ADMIN_CONFIG;

        await putFileToGitHub(
            token,
            contentPath,
            JSON.stringify(siteData, null, 2),
            'Update site content via admin portal',
            FILE_SHA_KEY
        );

        showStatus('Published! Your live site updates in ~1 minute.', 'success');
    }

    async function saveToGitHub() {
        const token = getActiveToken();
        if (!token) {
            showStatus('Connect GitHub in Settings first, then click Publish Changes.', 'error');
            activeTab = 'settings';
            document.querySelectorAll('#nav-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'settings'));
            renderEditor();
            return;
        }

        showStatus('Publishing to your live site…', 'info');

        try {
            await publishToGitHub(token);
        } catch (err) {
            showStatus(err.message, 'error');
        }
    }

    function initTabs() {
        document.querySelectorAll('#nav-tabs button').forEach((btn) => {
            btn.addEventListener('click', () => {
                syncCurrentTab();
                activeTab = btn.dataset.tab;
                document.querySelectorAll('#nav-tabs button').forEach((b) => b.classList.toggle('active', b === btn));
                renderEditor();
                hideStatus();
            });
        });
    }

    async function init() {
        try {
            await loadAdminConfig();
        } catch (err) {
            document.getElementById('login-error').textContent = err.message;
            document.getElementById('login-error').classList.remove('hidden');
            return;
        }

        document.getElementById('login-form').addEventListener('submit', handleLogin);
        document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
        document.getElementById('save-btn')?.addEventListener('click', saveToGitHub);
        initTabs();

        if (isLoggedIn()) {
            const savedPassword = sessionStorage.getItem(UNLOCK_KEY);
            if (!savedPassword) {
                lockSession();
                return;
            }

            try {
                await unlockSession(savedPassword);
                if (!getActiveToken() && window.ADMIN_CONFIG.encryptedToken) {
                    lockSession();
                    showStatus('Session expired. Please sign in again.', 'info');
                    return;
                }
                await loadContent();
                showApp();
                renderEditor();
            } catch {
                lockSession();
            }
        }
    }

    init();
})();
