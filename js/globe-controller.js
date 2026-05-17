document.addEventListener('DOMContentLoaded', () => {
    let myGlobe;
    const container = document.getElementById('rank-inner');
    const viz = document.getElementById('globe-viz');
    const closeBtn = document.getElementById('close-globe');

    let globalPopData = [];
    let countriesGeojson = null;
    let currentRankData = { num: 100, isTop3: false };

    // Fetch accurate global population data
    fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/world_population.csv')
      .then(res => {
          if (!res.ok) throw new Error('Network response not ok');
          return res.text();
      })
      .catch(() => fetch('/assets/globe_data/world_population.csv').then(res => res.text()))
      .then(csv => {
          globalPopData = csv.split('\n').slice(1).map(line => {
              const [lat, lng, pop] = line.split(',');
              if(!lat || !lng) return null;
              return { lat: +lat, lng: +lng, pop: +pop };
          }).filter(Boolean).sort((a, b) => b.pop - a.pop);
          
          if (myGlobe) updateGlobeData();
      });

    // Fetch countries GeoJSON for contours
    fetch('https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(res => {
          if (!res.ok) throw new Error('Network response not ok');
          return res.json();
      })
      .catch(() => fetch('/assets/globe_data/ne_110m_admin_0_countries.geojson').then(res => res.json()))
      .then(geojson => {
          countriesGeojson = geojson.features;
          if (myGlobe) updateGlobeData();
      });

    function updateGlobeTheme() {
        if (!myGlobe) return;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        if (isDark) {
            myGlobe.showGlobe(true)
                .showAtmosphere(true);
        } else {
            myGlobe.showGlobe(false)
                .showAtmosphere(false);
        }

        // Dynamically update Accessors without destroying/flashing the physical node geometries
        const baseColor = isDark ? 'rgba(255,255,255, 0.05)' : 'rgba(0,0,0, 0.15)';
        const highlightColor = isDark ? '#10b981' : '#d4a373';
        myGlobe.pointColor(d => d.active ? highlightColor : baseColor);

        if (countriesGeojson) {
            const strokeColor = isDark ? 'rgba(255,255,255, 0.15)' : 'rgba(0,0,0, 0.15)';
            myGlobe.polygonStrokeColor(() => strokeColor);
        }
    }

    let themeTimeout;
    const themeObserver = new MutationObserver((mutations) => {
        mutations.forEach(m => {
            if (m.attributeName === 'data-theme') {
                clearTimeout(themeTimeout);
                // Defer WebGL compilation to allow smooth ~300ms CSS background transitions to finish without dropping frames
                themeTimeout = setTimeout(updateGlobeTheme, 350);
            }
        });
    });
    themeObserver.observe(document.documentElement, { attributes: true });

    closeBtn.addEventListener('click', () => {
        container.classList.remove('has-globe');
        document.querySelectorAll('tr[data-rank]').forEach(r => r.classList.remove('active-row'));
        const wrapper = document.querySelector('.content-wrapper');
        if (wrapper) wrapper.classList.remove('theater-mode');
    });

    function updateGlobeData() {
        if (!globalPopData.length) return;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const baseColor = isDark ? 'rgba(255,255,255, 0.05)' : 'rgba(0,0,0, 0.15)';
        const highlightColor = isDark ? '#10b981' : '#d4a373';

        const { num, isTop3, rankName } = currentRankData;

        // Determine active subset size naturally
        let activeCount = Math.floor(globalPopData.length * (num / 100));
        
        // Manual scaling overrides for low tiers to preserve visual mass & mathematically scale down properly to Monarch's 35-dot array
        if (rankName === "The Freeman") activeCount = Math.max(activeCount, 150);
        if (rankName === "The Earl") activeCount = 90;
        if (rankName === "The Duke") activeCount = 55;

        let selectedSet = new Set();

        const hubTests = [
            { name: "Beijing", test: c => c.lat >= 39 && c.lat <= 41 && c.lng >= 115 && c.lng <= 118, count: 4 },
            { name: "Shanghai", test: c => c.lat >= 29 && c.lat <= 32 && c.lng >= 119 && c.lng <= 122, count: 4 },
            { name: "Shenzhen", test: c => c.lat >= 22 && c.lat <= 24 && c.lng >= 112 && c.lng <= 115, count: 3 },
            { name: "BayArea", test: c => c.lat >= 37 && c.lat <= 39 && c.lng >= -123 && c.lng <= -121, count: 6 },
            { name: "LA", test: c => c.lat >= 33 && c.lat <= 35 && c.lng >= -119 && c.lng <= -117, count: 2 },
            { name: "NY", test: c => c.lat >= 40 && c.lat <= 42 && c.lng >= -75 && c.lng <= -73, count: 3 },
            { name: "Seattle", test: c => c.lat >= 46 && c.lat <= 48 && c.lng >= -123 && c.lng <= -121, count: 2 },
            { name: "Boston", test: c => c.lat >= 41 && c.lat <= 43 && c.lng >= -72 && c.lng <= -70, count: 2 },
            { name: "Austin", test: c => c.lat >= 29.5 && c.lat <= 31 && c.lng >= -99 && c.lng <= -96.5, count: 2 },
            { name: "London", test: c => c.lat >= 51 && c.lat <= 52 && c.lng >= -1 && c.lng <= 1, count: 3 },
            { name: "Toronto", test: c => c.lat >= 43 && c.lat <= 46.5 && c.lng >= -80 && c.lng <= -72.5, count: 2 },
        ];

        if (isTop3) {
            let scalar = 1;
            if (rankName === "The Duke") scalar = 1.8;
            if (rankName === "The Earl") scalar = 3.0;

            let shuffled = [...globalPopData].sort(() => 0.5 - Math.random());
            hubTests.forEach(hub => {
                let found = 0;
                let targetCount = Math.max(1, Math.floor(hub.count * scalar));
                for (let c of shuffled) {
                    if (hub.test(c)) {
                        selectedSet.add(c);
                        found++;
                        if (found >= targetCount) break;
                    }
                }
            });

            if (rankName !== "The Monarch") {
                let euEligible = globalPopData.filter(c => c.lat >= 40 && c.lat <= 60 && c.lng >= -10 && c.lng <= 30);
                let euCount = rankName === "The Duke" ? 15 : 35;
                let step = Math.max(1, Math.floor(euEligible.length / euCount));
                euEligible.filter((_, i) => i % step === 0).slice(0, euCount).forEach(c => selectedSet.add(c));
            }
        } else {
            // Systematic deterministic sampling for Freeman and lower tiers natively down the population
            const step = Math.max(1, Math.floor(globalPopData.length / activeCount));
            selectedSet = new Set(globalPopData.filter((_, i) => i % step === 0).slice(0, activeCount));
        }

        const gData = globalPopData.map(c => {
            const active = selectedSet.has(c);
            return {
                lat: c.lat,
                lng: c.lng,
                size: active ? (Math.random() * 0.15 + 0.1) : 0.02,
                active: active
            };
        });

        myGlobe.pointColor(d => d.active ? highlightColor : baseColor);
        myGlobe.pointsData(gData);

        if (countriesGeojson && !myGlobe.polygonsData().length) {
            myGlobe.polygonsData(countriesGeojson)
                .polygonCapColor(() => 'rgba(0,0,0,0)')
                .polygonSideColor(() => 'rgba(0,0,0,0)')
                .polygonStrokeColor(() => document.documentElement.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255, 0.15)' : 'rgba(0,0,0, 0.15)')
                .polygonAltitude(0.005);
        }
    }

    document.querySelectorAll('.pop-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tr = e.target.closest('tr');
            const rankName = tr.querySelector('td:nth-child(1)').innerText.trim();
            const pctStr = e.target.innerText.trim();

            container.classList.add('has-globe');
            const wrapper = document.querySelector('.content-wrapper');
            if (wrapper) wrapper.classList.add('theater-mode');

            const top3 = ["The Earl", "The Duke", "The Monarch"];
            const isTop3 = top3.includes(rankName);
            const num = parseFloat(pctStr.replace(/[^\d.]/g, ''));

            currentRankData = { num, isTop3, rankName };

            if (!myGlobe) {
                myGlobe = Globe()(viz)
                    .backgroundColor('rgba(0,0,0,0)')
                    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
                    .pointAltitude(0.015)
                    .pointRadius('size');

                myGlobe.controls().autoRotate = true;
                myGlobe.controls().autoRotateSpeed = 2.0;

                setTimeout(() => {
                    myGlobe.width(viz.clientWidth).height(viz.clientHeight);
                    updateGlobeTheme();
                    updateGlobeData();
                }, 500);
            } else {
                updateGlobeData();
            }
        });
    });

    // Auto-show globe on page load with The Serf (84%) as default
    function initGlobeDefault() {
        container.classList.add('has-globe');
        const wrapper = document.querySelector('.content-wrapper');
        if (wrapper) wrapper.classList.add('theater-mode');

        currentRankData = { num: 84, isTop3: false, rankName: "The Serf" };

        myGlobe = Globe()(viz)
            .backgroundColor('rgba(0,0,0,0)')
            .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-dark.jpg')
            .pointAltitude(0.015)
            .pointRadius('size');

        myGlobe.controls().autoRotate = true;
        myGlobe.controls().autoRotateSpeed = 2.0;

        setTimeout(() => {
            myGlobe.width(viz.clientWidth).height(viz.clientHeight);
            updateGlobeTheme();
            updateGlobeData();
        }, 500);
    }

    initGlobeDefault();
});
