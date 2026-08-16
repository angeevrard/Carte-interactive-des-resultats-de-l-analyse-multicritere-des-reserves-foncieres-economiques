/* ==========================================================
   carte.js
   Tout ce qui concerne la carte Leaflet : fond de carte, clusters
   de points a petite echelle, parcelles AHP + contours de zonage
   quand on zoome, et les limites administratives (commune / EPCI /
   SCoT) affichees en contexte.

   Ces dictionnaires (couleurs, libelles, regroupement des sous-criteres
   par famille) sont basés sur les vrais champs de mes fichiers exportes
   depuis le plugin QGIS (mf_..., std_..., classe_apt).
   ========================================================== */

// couleurs des classes de potentiel, a garder synchro avec la legende
// dans index.html. les cles sont exactement les valeurs du champ
// "classe_apt" du geojson. seuils : voir classeDepuisValeur() plus bas
const COULEURS_CLASSES = {
  "Faible potentiel de mobilisation": "#e8735c",
  "Potentiel de mobilisation modéré": "#f2a65a",
  "Potentiel de mobilisation élevé": "#6fb57b",
};

// en mode "Detail par famille de criteres", on ne parle plus de "Potentiel"
// (qui concerne la reserve dans son ensemble) mais d'"Aptitude" pour la
// famille regardee -- meme classification/couleur, seule la terminologie
// change, pour rester coherent avec la legende "Aptitude favorable /
// moderee / defavorable"
const CORRESPONDANCE_APTITUDE = {
  "Faible potentiel de mobilisation": "Aptitude défavorable",
  "Potentiel de mobilisation modéré": "Aptitude modérée",
  "Potentiel de mobilisation élevé": "Aptitude favorable",
};

// les 4 familles de criteres (champs mf_...) avec un libelle lisible
const LIBELLES_FAMILLES = {
  mf_attractivite_geog: "Attractivité géographique",
  mf_aptitude_aux_rese: "Aptitude aux réseaux techniques et à la mutualisation des équipements et services",
  mf_enjeux_forestiers: "Enjeux forestiers, écologiques et de risques naturels",
  mf_aptitude_physique: "Aptitude physique et foncière",
};

// version courte, utilisee uniquement pour les axes du radar : la place
// y est trop limitee pour le libelle complet ci-dessus (surtout celui des
// reseaux techniques). le nom complet reste utilise partout ailleurs
// (menu deroulant, titre du detail au clic sur un sommet)
const LIBELLES_FAMILLES_COURT = {
  mf_attractivite_geog: "Attractivité géographique",
  mf_aptitude_aux_rese: "Aptitude aux réseaux techniques et à la mutualisation des équipements et services",
  mf_enjeux_forestiers: "Enjeux forestiers, écologiques et de risques naturels",
  mf_aptitude_physique: "Aptitude physique et foncière",
};

// les sous-criteres (champs std_...), regroupes par famille dans le meme
// ordre que dans le fichier source, avec un libelle lisible pour le radar
const SOUS_CRITERES_PAR_FAMILLE = {
  mf_attractivite_geog: [
    "std_acess_TC",
    "std_articu_piste_cyclable",
    "std_acess_restauration",
    "std_acess_echangeur",
    "std_posi_armature_urbaine",
  ],
  mf_aptitude_aux_rese: [
    "std_proximite_res_elect",
    "std_articu_zae_existante",
    "std_proximite_aep",
    "std_proximite_res_chauffage_urb",
  ],
  mf_enjeux_forestiers: [
    "std_enjeux_forestier",
    "std_expo_risq_inondation",
    "std_expo_risque_mvt_terrain",
    "std_pres_zone_hum_res_biodiv",
  ],
  mf_aptitude_physique: ["std_pente_moy_terrain", "std_maitrise_fonciere"],
};

const LIBELLES_SOUS_CRITERES = {
  std_acess_TC: "Accessibilité en transport en commun (par la marche)",
  std_articu_piste_cyclable: "Articulation aux pistes cyclables",
  std_acess_restauration: "Accès aux services de restauration (par la marche)",
  std_acess_echangeur: "Accès à un échangeur",
  std_posi_armature_urbaine: "Position dans l'armature urbaine",
  std_proximite_res_elect: "Proximité aux réseaux électriques",
  std_articu_zae_existante: "Articulation ZAE existante",
  std_proximite_aep: "Proximité aux réseaux AEP",
  std_proximite_res_chauffage_urb: "Proximité réseaux de chauffage urbain",
  std_enjeux_forestier: "Enjeu forestier",
  std_expo_risq_inondation: "Exposition au risque inondation",
  std_expo_risque_mvt_terrain: "Exposition au risque mouvement de terrain",
  std_pres_zone_hum_res_biodiv: "Exposition au Zone humide / biodiversité",
  std_pente_moy_terrain: "Pente moyenne du terrain",
  std_maitrise_fonciere: "Maîtrise foncière",
};

// a partir de ce niveau de zoom, on quitte les clusters pour voir
// les parcelles + le zonage eco en detail
const SEUIL_ZOOM_DETAIL = 13;

// etat "global" simple de l'appli (pas de framework, on garde ca minimal)
// les autres fichiers (interface.js, radar.js) viennent lire/ecrire dedans
const EtatCarte = {
  carte: null,
  coucheClusters: null,
  coucheParcelles: null,
  coucheZonage: null,
  coucheCommunes: null,
  coucheEPCI: null,
  coucheSCoT: null,
  indicateurActuel: "score_final", // score_final ou une cle mf_...
  afficherLabels: true,
  epciFiltre: "", // vide = pas de filtre
  idReserveSelectionnee: null,
  empriseInitiale: null, // vue de depart, memorisee une fois les donnees chargees
};

/* ---------- helpers sur les donnees ---------- */

// "1" -> "RF001", juste pour l'affichage (le vrai identifiant reste le
// champ numerique ID)
function formatIdAffichage(id) {
  return "RF" + String(id).padStart(3, "0");
}

// renvoie la valeur numerique correspondant a l'indicateur choisi dans
// le menu deroulant (score final ou score d'une des 4 familles)
function valeurIndicateur(props, indicateur) {
  if (indicateur === "score_final") return props.score_final;
  return props[indicateur];
}

// pour les indicateurs autres que score_final, la classe n'est pas
// pre-calculee -> on applique les memes seuils que la legende du memoire
// (0,00-0,33 / 0,33-0,67 / 0,67-1)
function classeDepuisValeur(valeur) {
  // on arrondit a 2 decimales avant de comparer aux seuils, comme le
  // score affiche a l'ecran (0,67) et comme classe_apt cote QGIS -- sinon
  // une valeur brute du genre 0.6699373... reste juste en dessous de 0.67
  // et tombe dans la mauvaise classe alors qu'elle s'affiche "0,67"
  const arrondi = Math.round(valeur * 100) / 100;
  if (arrondi < 0.33) return "Faible potentiel de mobilisation";
  if (arrondi < 0.67) return "Potentiel de mobilisation modéré";
  return "Potentiel de mobilisation élevé";
}

function classePourFeature(props) {
  // avant : on utilisait props.classe_apt tel quel comme cle vers
  // COULEURS_CLASSES pour le score final. probleme : la couleur dependait
  // alors du texte exact ecrit dans le geojson (accents, espaces...), donc
  // le moindre ecart de texte cassait la couleur sans erreur visible.
  // maintenant on calcule TOUJOURS la couleur depuis le score numerique
  // (identique pour score final et pour les familles) -> classe_apt reste
  // uniquement le texte affiche a l'ecran, jamais utilise pour la couleur.
  return classeDepuisValeur(valeurIndicateur(props, EtatCarte.indicateurActuel));
}

// une feature doit-elle etre visible avec le filtre EPCI actuel ?
function featureEstVisible(props) {
  if (EtatCarte.epciFiltre && props.epci !== EtatCarte.epciFiltre) return false;
  return true;
}

/* ---------- initialisation de la carte ---------- */

function initCarte() {
  EtatCarte.carte = L.map("carte", {
    zoomControl: false, // je remets les boutons +/- a la main plus bas
    attributionControl: false, // deplacee en bas a gauche juste en dessous, pour laisser le bas-droite a la legende
  }).setView([46.6, 2.5], 6); // vue par defaut le temps que les donnees arrivent, recentree ensuite

  L.control.attribution({ position: "bottomleft" }).addTo(EtatCarte.carte);

  // trois fonds de carte au choix, avec un petit control en haut a droite
  // pour basculer de l'un a l'autre (comme sur google maps)
  const coucheOSM = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; contributeurs OpenStreetMap",
    maxZoom: 19,
  });

  // attention : ce sont les tuiles satellite "publiques" de google, pas une
  // api officielle. ca marche bien pour un memoire mais si le lien casse un
  // jour, l'alternative la plus fiable est le fond satellite d'esri :
  // https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}
  const coucheSatellite = L.tileLayer("https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}", {
    subdomains: ["mt0", "mt1", "mt2", "mt3"],
    attribution: "Imagerie &copy; Google",
    maxZoom: 20,
  });

  const coucheClaire = L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: "&copy; OpenStreetMap contributors &copy; CARTO",
    subdomains: "abcd",
    maxZoom: 19,
  });

  coucheClaire.addTo(EtatCarte.carte);

  L.control
    .layers(
      {
        "Fond clair": coucheClaire,
        "Fond OSM standard": coucheOSM,
        "Fond Google satellite": coucheSatellite,
      },
      null,
      { position: "topright" }
    )
    .addTo(EtatCarte.carte);

  L.control.zoom({ position: "topleft" }).addTo(EtatCarte.carte);
  L.control.scale({ position: "bottomleft", imperial: false }).addTo(EtatCarte.carte);

  // les deux boutons ajoutes juste sous le zoom : ils s'empilent tout
  // seuls puisqu'ils sont ajoutes a la meme position ("topleft"), dans
  // l'ordre ou on les ajoute
  ajouterBoutonControle("🔄", "Réinitialiser la carte", "Revenir à la vue de départ", reinitialiserCarte);
  ajouterBoutonControle("ℹ️", "Afficher l'aide", "Afficher l'aide de navigation", basculerAideCarte);
  document.getElementById("bouton-fermer-aide").addEventListener("click", basculerAideCarte);

  // panes dediees pour les limites administratives : ca fixe leur ordre
  // d'affichage une fois pour toutes (SCoT devant, puis EPCI, puis communes),
  // sinon a chaque fois qu'on decoche/recoche une case, leaflet remet la
  // couche tout en haut de la pile et l'ordre visuel change tout seul.
  // le tout reste sous l'overlayPane par defaut (zIndex 400) pour que les
  // parcelles/clusters de reserves restent toujours au-dessus.
  EtatCarte.carte.createPane("paneCommunes");
  EtatCarte.carte.getPane("paneCommunes").style.zIndex = 392;
  EtatCarte.carte.createPane("paneEPCI");
  EtatCarte.carte.getPane("paneEPCI").style.zIndex = 394;
  EtatCarte.carte.createPane("paneSCoT");
  EtatCarte.carte.getPane("paneSCoT").style.zIndex = 396;

  chargerDonnees();

  // on recalcule les couches visibles a chaque fois qu'on zoome
  EtatCarte.carte.on("zoomend", mettreAJourCouchesSelonZoom);
}

/* ---------- chargement des geojson ---------- */

function chargerDonnees() {
  Promise.all([
    fetch("data/Resultat_RF_ahp.geojson").then((r) => r.json()),
    fetch("data/Centroide_RF.geojson").then((r) => r.json()),
    fetch("data/Contours_zonage_eco.geojson").then((r) => r.json()),
    fetch("data/COMMUNE.geojson").then((r) => r.json()),
    fetch("data/EPCI.geojson").then((r) => r.json()),
    fetch("data/SCOTERS.geojson").then((r) => r.json()),
  ])
    .then(([resultats, centroides, zonage, communes, epci, scot]) => {
      // couches de contexte (limites administratives) : ajoutees en premier
      // pour rester sous les couches de resultats
      construireCoucheCommunes(communes);
      construireCoucheEPCI(epci);
      construireCoucheSCoT(scot);
      EtatCarte.donneesEPCI = epci; // garde en memoire pour zoomVersEPCI()
      if (document.getElementById("case-limite-commune").checked) EtatCarte.coucheCommunes.addTo(EtatCarte.carte);
      if (document.getElementById("case-limite-epci").checked) EtatCarte.coucheEPCI.addTo(EtatCarte.carte);
      if (document.getElementById("case-limite-scot").checked) EtatCarte.coucheSCoT.addTo(EtatCarte.carte);

      construireCoucheClusters(centroides);
      construireCoucheParcelles(resultats);
      construireCoucheZonage(zonage);

      // au depart on est zoome large donc ce sont les clusters qui s'affichent
      EtatCarte.coucheClusters.addTo(EtatCarte.carte);

      // on recadre la carte sur l'emprise reelle des donnees (plus fiable
      // qu'un centre code en dur, au cas ou je change de territoire d'etude)
      const emprise = L.geoJSON(centroides).getBounds();
      if (emprise.isValid()) {
        EtatCarte.carte.fitBounds(emprise, { padding: [30, 30] });
        EtatCarte.empriseInitiale = emprise; // garde en memoire pour le bouton "Reinitialiser la carte"
      }

      // on previent interface.js que les donnees sont pretes (il construit
      // le filtre EPCI, etc.)
      window.dispatchEvent(
        new CustomEvent("donnees-chargees", { detail: { resultats, centroides, zonage } })
      );
    })
    .catch((erreur) => {
      // si jamais un des fichiers de data n'existe pas encore, on previent
      // plutot que de laisser une carte vide sans explication
      console.error("Impossible de charger les fichiers geojson :", erreur);
      alert(
        "Les fichiers de données (dossier data/) n'ont pas pu être chargés. " +
          "Vérifie qu'ils sont bien présents et que la page est servie via un serveur local (pas en file://)."
      );
    });
}

/* ---------- couches de limites administratives (contexte) ---------- */
// affichees a tous les niveaux de zoom, independamment des clusters/parcelles

function construireCoucheCommunes(communes) {
  EtatCarte.coucheCommunes = L.geoJSON(communes, {
    pane: "paneCommunes",
    // fillOpacity: 0 plutot que fill: false -> sinon leaflet ne detecte
    // le survol que sur le trait du contour, pas a l'interieur du polygone
    style: { fill: true, fillOpacity: 0, color: "#9ca3af", weight: 1 },
    onEachFeature: function (feature, calque) {
      calque.bindTooltip(feature.properties.NOM, { sticky: true });
    },
  });
}

function construireCoucheEPCI(epci) {
  // interactive: false -> ce contour ne doit pas "voler" le survol aux
  // communes qui sont dedans (sinon on ne voit jamais le nom de la commune)
  EtatCarte.coucheEPCI = L.geoJSON(epci, {
    pane: "paneEPCI",
    interactive: false,
    style: { color: "#2a5c8a", weight: 2, fill: false },
  });
}

function construireCoucheSCoT(scot) {
  // meme chose : le perimetre du SCoT recouvre toute la zone d'etude, donc
  // s'il reste interactif il capte tous les survols a la place des communes
  EtatCarte.coucheSCoT = L.geoJSON(scot, {
    pane: "paneSCoT",
    interactive: false,
    style: { color: "#d7263d", weight: 3, dashArray: "10 6", fill: false },
  });
}

/* ---------- couche des clusters (vue eloignee) ---------- */

function construireCoucheClusters(centroides) {
  EtatCarte.coucheClusters = L.markerClusterGroup({
    maxClusterRadius: 60,
    spiderfyOnMaxZoom: true,
  });

  const couchePoints = L.geoJSON(centroides, {
    filter: (feature) => featureEstVisible(feature.properties),
    pointToLayer: function (feature, latlng) {
      const classe = classePourFeature(feature.properties);
      return L.circleMarker(latlng, {
        radius: 7,
        fillColor: COULEURS_CLASSES[classe],
        color: "#ffffff",
        weight: 1.5,
        fillOpacity: 0.9,
      });
    },
    onEachFeature: attacherEvenementsFeature,
  });

  EtatCarte.coucheClusters.addLayer(couchePoints);

  // quand on clique sur un cluster, leaflet.markercluster zoome deja
  // automatiquement (zoomToBoundsOnClick par defaut) mais je force un
  // niveau de zoom minimum pour etre sur de tomber dans la vue detail
  EtatCarte.coucheClusters.on("clusterclick", function (evenement) {
    const zoomCible = Math.max(EtatCarte.carte.getZoom() + 2, SEUIL_ZOOM_DETAIL);
    EtatCarte.carte.setView(evenement.layer.getLatLng(), zoomCible);
  });
}

/* ---------- couche des parcelles AHP (vue rapprochee) ---------- */

function construireCoucheParcelles(resultats) {
  EtatCarte.coucheParcelles = L.geoJSON(resultats, {
    filter: (feature) => featureEstVisible(feature.properties),
    style: styleParcelle,
    onEachFeature: function (feature, calque) {
      attacherEvenementsFeature(feature, calque);
      if (EtatCarte.afficherLabels) {
        calque.bindTooltip(formatIdAffichage(feature.properties.ID), {
          permanent: true,
          direction: "top",
          className: "etiquette-reserve",
        });
      }
    },
  });
}

function styleParcelle(feature) {
  const classe = classePourFeature(feature.properties);
  const estSelectionnee = feature.properties.ID === EtatCarte.idReserveSelectionnee;
  return {
    fillColor: COULEURS_CLASSES[classe],
    fillOpacity: 0.55,
    // le contour reste marine dans les deux cas (coherent avec la legende
    // "Reserve fonciere analysee") -- avant, le contour non-selectionne
    // etait blanc, donc invisible sur le fond de carte clair (Positron)
    color: "#0b2545",
    weight: estSelectionnee ? 3 : 1.3,
    opacity: estSelectionnee ? 1 : 0.55,
  };
}

/* ---------- couche du zonage economique (contexte, liee au zoom) ---------- */

function construireCoucheZonage(zonage) {
  EtatCarte.coucheZonage = L.geoJSON(zonage, {
    style: {
      fill: false,
      color: "#0b2545",
      weight: 2,
      dashArray: "6 4",
    },
    onEachFeature: function (feature, calque) {
      // ce fichier n'a pas de nom de zone en attribut, donc un libelle generique
      calque.bindTooltip("Contour de zonage économique", { sticky: true });
    },
  });
}

/* ---------- clic sur une feature (marker ou parcelle) ---------- */

function attacherEvenementsFeature(feature, calque) {
  calque.on("click", function () {
    selectionnerReserve(feature.properties.ID);
  });
}

/* ---------- bascule clusters <-> parcelles+zonage selon le zoom ---------- */
/* (les limites administratives, elles, restent affichees a tous les zooms) */

function mettreAJourCouchesSelonZoom() {
  const zoom = EtatCarte.carte.getZoom();
  const carte = EtatCarte.carte;

  if (zoom >= SEUIL_ZOOM_DETAIL) {
    if (carte.hasLayer(EtatCarte.coucheClusters)) carte.removeLayer(EtatCarte.coucheClusters);
    if (!carte.hasLayer(EtatCarte.coucheParcelles)) EtatCarte.coucheParcelles.addTo(carte);
    if (!carte.hasLayer(EtatCarte.coucheZonage)) EtatCarte.coucheZonage.addTo(carte);
  } else {
    if (!carte.hasLayer(EtatCarte.coucheClusters)) EtatCarte.coucheClusters.addTo(carte);
    if (carte.hasLayer(EtatCarte.coucheParcelles)) carte.removeLayer(EtatCarte.coucheParcelles);
    if (carte.hasLayer(EtatCarte.coucheZonage)) carte.removeLayer(EtatCarte.coucheZonage);
  }
}

/* ---------- fonctions appelees depuis interface.js ---------- */

// reconstruit le style des parcelles + points (utilise quand on change
// l'indicateur affiche ou le filtre EPCI)
function rafraichirCouches(resultats, centroides) {
  EtatCarte.carte.removeLayer(EtatCarte.coucheParcelles);
  EtatCarte.carte.removeLayer(EtatCarte.coucheClusters);
  construireCoucheClusters(centroides);
  construireCoucheParcelles(resultats);
  mettreAJourCouchesSelonZoom();
}

// affiche/masque une couche de limite administrative (appele par les
// cases a cocher "Limites administratives" de la sidebar)
function basculerCoucheLimite(couche, visible) {
  if (!couche) return;
  if (visible) couche.addTo(EtatCarte.carte);
  else EtatCarte.carte.removeLayer(couche);
}

// centre la carte sur une reserve et zoome assez pour voir la parcelle
function zoomVersReserve(feature) {
  const calqueTemporaire = L.geoJSON(feature);
  EtatCarte.carte.fitBounds(calqueTemporaire.getBounds(), { maxZoom: 16, padding: [40, 40] });
}

// le nom d'un meme EPCI n'est pas ecrit pareil dans Resultat_RF_ahp.geojson
// ("Eurométropole de Strasbourg") et dans EPCI.geojson ("STRASBOURG
// EUROMÉTROPOLE") -> comparaison "floue" par mots-cles communs plutot
// qu'une egalite stricte
function normaliserNomEpci(texte) {
  return texte
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // enleve les accents
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ") // vire les apostrophes etc.
    .split(" ")
    .filter(function (mot) {
      return mot.length > 2 && ["LES", "DES", "DE", "DU", "LA", "LE", "CDC"].indexOf(mot) === -1;
    });
}

function memeEpci(nomA, nomB) {
  const motsA = normaliserNomEpci(nomA);
  const motsB = normaliserNomEpci(nomB);
  return motsA.some(function (mot) {
    return motsB.indexOf(mot) !== -1;
  });
}

// zoome sur l'emprise de l'EPCI choisi dans le filtre de la sidebar
function zoomVersEPCI(nomEpci) {
  if (!EtatCarte.donneesEPCI) return;
  const feature = EtatCarte.donneesEPCI.features.find(function (f) {
    return memeEpci(f.properties.NOM_EPCI, nomEpci);
  });
  if (feature) {
    const calque = L.geoJSON(feature);
    EtatCarte.carte.fitBounds(calque.getBounds(), { padding: [20, 20] });
  }
}

// remet en valeur le contour de la parcelle selectionnee (bordure plus epaisse)
function mettreEnValeurParcelle(id) {
  EtatCarte.idReserveSelectionnee = id;
  if (EtatCarte.coucheParcelles) {
    EtatCarte.coucheParcelles.setStyle(styleParcelle);
  }
}

// le panneau de detail change la largeur de la carte -> leaflet a besoin
// qu'on lui dise de recalculer sa taille, sinon l'affichage reste coupe
function redimensionnerCarte() {
  if (!EtatCarte.carte) return;
  setTimeout(function () {
    EtatCarte.carte.invalidateSize();
  }, 200);
}

/* ---------- petits boutons rectangulaires sous le zoom ---------- */

// bouton generique icone + texte, empile sous le zoom (position "topleft")
function ajouterBoutonControle(icone, texte, titre, auClic) {
  const Controle = L.Control.extend({
    options: { position: "topleft" },
    onAdd: function () {
      const bouton = L.DomUtil.create("button", "leaflet-bouton-texte");
      bouton.innerHTML = '<span class="leaflet-bouton-icone">' + icone + "</span>" + texte;
      bouton.title = titre;
      L.DomEvent.disableClickPropagation(bouton);
      bouton.addEventListener("click", auClic);
      return bouton;
    },
  });
  new Controle().addTo(EtatCarte.carte);
}

// revient a la vue de depart (l'emprise calculee au premier chargement des donnees)
function reinitialiserCarte() {
  if (EtatCarte.empriseInitiale) {
    EtatCarte.carte.fitBounds(EtatCarte.empriseInitiale, { padding: [30, 30] });
  }
  if (!document.getElementById("panneau-detail").classList.contains("cache")) {
    fermerPanneauDetail();
  }
}

// ouvre/ferme le petit panneau d'aide sous les boutons zoom/reinitialiser/aide
function basculerAideCarte() {
  document.getElementById("aide-carte").classList.toggle("cache");
}
