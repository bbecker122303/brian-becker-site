(function () {
    const CONTENT_PATH = '../content/site.json';

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text ?? '';
        return div.innerHTML;
    }

    function renderHome(data) {
        const { hero, sections } = data.home;

        document.title = hero.title;
        setHtml('[data-content="home.hero.title"]', escapeHtml(hero.title));
        setHtml('[data-content="home.hero.subtitle"]', escapeHtml(hero.subtitle));
        setHtml('[data-content="home.hero.bio"]', escapeHtml(hero.bio));
        setAttr('[data-content="home.hero.profileImage"]', 'src', hero.profileImage);
        setAttr('[data-content="home.hero.profileImage"]', 'alt', hero.title);

        const cta = document.querySelector('[data-content="home.hero.cta"]');
        if (cta) {
            cta.textContent = hero.ctaText;
            cta.href = hero.ctaLink;
        }

        const container = document.getElementById('home-sections');
        if (!container) return;

        container.innerHTML = sections.map((section) => {
            const sectionStyle = section.grayBg ? ' style="background-color: #f9f9f9;"' : '';
            const imageBlock = `<img src="${escapeHtml(section.image)}" alt="${escapeHtml(section.title)}">`;
            const textBlock = `
                <div>
                    <h2>${escapeHtml(section.title)}</h2>
                    <p class="subtitle">${escapeHtml(section.subtitle)}</p>
                    <p>${escapeHtml(section.body)}</p>
                    <a href="${escapeHtml(section.linkHref)}" class="btn btn-outline">${escapeHtml(section.linkText)}</a>
                </div>`;

            const gridContent = section.imageFirst
                ? `${imageBlock}${textBlock}`
                : `${textBlock}${imageBlock}`;

            return `
                <section${sectionStyle}>
                    <div class="container">
                        <div class="grid-2">${gridContent}</div>
                    </div>
                </section>`;
        }).join('');
    }

    function renderAbout(data) {
        const { header, banner, education, certifications, volunteer } = data.about;

        document.title = `About | ${data.home.hero.title}`;
        setHtml('[data-content="about.header.title"]', escapeHtml(header.title));
        setHtml('[data-content="about.header.subtitle"]', escapeHtml(header.subtitle));
        setHtml('[data-content="about.banner"]', escapeHtml(banner));

        setHtml('[data-content="about.education"]', education.map((row) => `
            <tr>
                <td>${escapeHtml(row.institution)}</td>
                <td>${escapeHtml(row.location)}</td>
                <td>${escapeHtml(row.years)}</td>
            </tr>`).join(''));

        setHtml('[data-content="about.certifications"]', certifications.map((row) => `
            <tr>
                <td>${escapeHtml(row.name)}</td>
                <td>${escapeHtml(row.organization)}</td>
            </tr>`).join(''));

        setHtml('[data-content="volunteer.title"]', escapeHtml(volunteer.title));
        setHtml('[data-content="volunteer.org"]', escapeHtml(volunteer.org));
        setHtml('[data-content="volunteer.description"]', escapeHtml(volunteer.description));
        setAttr('[data-content="volunteer.image"]', 'src', volunteer.image);
    }

    function renderMed(data) {
        const { header, about, publications } = data.med;

        document.title = `Medical | ${data.home.hero.title}`;
        setHtml('[data-content="med.header.title"]', escapeHtml(header.title));
        setHtml('[data-content="med.header.subtitle"]', escapeHtml(header.subtitle));
        setHtml('[data-content="med.about"]', `<h2>About My Journey</h2>${about.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('')}`);

        const list = document.getElementById('publications-list');
        if (!list) return;

        list.innerHTML = publications.map((pub) => `
            <div class="card">
                <h3>${escapeHtml(pub.title)}</h3>
                ${pub.firstAuthor ? '<span class="badge">First Author</span>' : ''}
                <p><em>${escapeHtml(pub.journal)}</em></p>
                <p>${escapeHtml(pub.description)}</p>
                <a href="${escapeHtml(pub.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-outline">Read Publication</a>
            </div>`).join('');
    }

    function renderBusiness(data) {
        const { header, vue, elite } = data.business;

        document.title = `Business | ${data.home.hero.title}`;
        setHtml('[data-content="business.header.title"]', escapeHtml(header.title));
        setHtml('[data-content="business.header.subtitle"]', escapeHtml(header.subtitle));

        setHtml('[data-content="vue.title"]', escapeHtml(vue.title));
        setHtml('[data-content="vue.subtitle"]', escapeHtml(vue.subtitle));
        setHtml('[data-content="vue.ownerNote"]', escapeHtml(vue.ownerNote));
        setHtml('[data-content="vue.bullets"]', vue.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join(''));
        setAttr('[data-content="vue.website"]', 'href', vue.websiteUrl);
        const video = document.querySelector('[data-content="vue.video"]');
        const source = video?.querySelector('source');
        if (source) {
            source.src = vue.videoSrc;
            video.load();
        }

        setHtml('[data-content="elite.title"]', escapeHtml(elite.title));
        setHtml('[data-content="elite.subtitle"]', escapeHtml(elite.subtitle));
        setHtml('[data-content="elite.body"]', escapeHtml(elite.body));
        setHtml('[data-content="elite.bullets"]', elite.bullets.map((item) => `<li>${escapeHtml(item)}</li>`).join(''));
        setAttr('[data-content="elite.image"]', 'src', elite.image);
        setAttr('[data-content="elite.website"]', 'href', elite.websiteUrl);
    }

    function renderContact(data) {
        const { header, intro, email, phone } = data.contact;

        document.title = `Contact | ${data.home.hero.title}`;
        setHtml('[data-content="contact.header.title"]', escapeHtml(header.title));
        setHtml('[data-content="contact.header.subtitle"]', escapeHtml(header.subtitle));
        setHtml('[data-content="contact.intro"]', escapeHtml(intro));
        document.querySelectorAll('[data-content="contact.emailLink"]').forEach((el) => {
            el.href = `mailto:${email}`;
            el.textContent = email;
        });
        document.querySelectorAll('[data-content="contact.phoneLink"]').forEach((el) => {
            el.href = `tel:${phone.replace(/\D/g, '')}`;
            el.textContent = phone;
        });
    }

    function renderFooter(data) {
        const { year, email } = data.footer;
        setHtml('[data-content="footer.copyright"]', `&copy; ${year} ${escapeHtml(data.home.hero.title)}. All Rights Reserved.`);
        document.querySelectorAll('[data-content="footer.emailLink"]').forEach((el) => {
            el.href = `mailto:${email}`;
            el.textContent = email;
        });
    }

    function setHtml(selector, html) {
        document.querySelectorAll(selector).forEach((el) => { el.innerHTML = html; });
    }

    function setAttr(selector, attr, value) {
        document.querySelectorAll(selector).forEach((el) => {
            if (selector.includes(' ')) {
                const [parentSel, childSel] = selector.split(' ');
                const parent = document.querySelector(parentSel);
                const child = parent?.querySelector(childSel);
                if (child) child.setAttribute(attr, value);
            } else {
                el.setAttribute(attr, value);
            }
        });
    }

    const renderers = {
        home: renderHome,
        about: renderAbout,
        med: renderMed,
        business: renderBusiness,
        contact: renderContact
    };

    async function init() {
        const page = document.body.dataset.page;
        if (!page) return;

        try {
            const response = await fetch(CONTENT_PATH);
            if (!response.ok) throw new Error('Failed to load content');
            const data = await response.json();

            if (renderers[page]) renderers[page](data);
            renderFooter(data);
        } catch (err) {
            console.warn('Content loader:', err.message);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
