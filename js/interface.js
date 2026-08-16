/* ==========================================================
   interface.js
   Tout ce qui n'est pas directement la carte ou le radar :
   filtres de la sidebar, panneau de detail a droite.

   Le panneau de droite est cache par defaut (classe "cache" dans
   le html) et ne s'affiche que quand on clique sur une reserve
   sur la carte.

   Ce fichier fait le lien entre carte.js et radar.js : c'est ici
   que se trouve selectionnerReserve().
   ========================================================== */

const EtatInterface = {
  resultats: null,
  centroides: null,
  zonage: null,
};

document.addEventListener("DOMContentLoaded", function () {
  initTheme();
  initCarte();
  attacherEvenementsSidebar();
  attacherEvenementsPanneau();
  attacherEvenementsEntete();
  attacherFermetureAuChangementFiltre();
});

// carte.js previent avec cet evenement des que tous les geojson sont charges
window.addEventListener("donnees-chargees", function (evenement) {
  EtatInterface.resultats = evenement.detail.resultats;
  EtatInterface.centroides = evenement.detail.centroides;
  EtatInterface.zonage = evenement.detail.zonage;

  peuplerFiltreEPCI();
});

/* ============================================================
   selection d'une reserve (fonction centrale, appelee depuis
   le clic sur la carte, cf carte.js -> attacherEvenementsFeature)
   ============================================================ */

function selectionnerReserve(id) {
  const feature = EtatInterface.resultats.features.find(function (f) {
    return f.properties.ID === id;
  });
  if (!feature) {
    console.warn("Reserve introuvable :", id);
    return;
  }

  mettreEnValeurParcelle(id);
  zoomVersReserve(feature);
  ouvrirPanneauDetail(feature);
}

/* ============================================================
   panneau de detail (colonne de droite, masque par defaut)
   ============================================================ */

function ouvrirPanneauDetail(feature) {
  const props = feature.properties;

  // le panneau etait cache -> on l'affiche, ce qui reduit la largeur de
  // la carte, donc on previent leaflet qu'il doit se redimensionner
  document.getElementById("panneau-detail").classList.remove("cache");
  redimensionnerCarte();

  document.getElementById("panneau-titre-id").textContent = "Réserve " + formatIdAffichage(props.ID);
  document.getElementById("panneau-epci").textContent = props.epci;
  document.getElementById("panneau-commune").textContent = props.commune;
  document.getElementById("panneau-surface").textContent =
    props.superficie_ha.toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " ha";

  dessinerRadarFamilles(feature);
}

function fermerPanneauDetail() {
  document.getElementById("panneau-detail").classList.add("cache");
  redimensionnerCarte();
  mettreEnValeurParcelle(null);
}

function attacherEvenementsPanneau() {
  document.getElementById("bouton-fermer-panneau").addEventListener("click", fermerPanneauDetail);
}

/* ============================================================
   bascule "Resultat general" <-> "Detail par famille de criteres"
   controle a la fois la couleur de la carte et la legende affichee
   ============================================================ */

function activerModeResultatGeneral() {
  document.getElementById("case-resultat-general").checked = true;
  document.getElementById("case-detail-famille").checked = false;
  document.getElementById("selecteur-famille").classList.add("cache");

  document.getElementById("tableau-legende-general").classList.remove("cache");
  document.getElementById("tableau-legende-famille").classList.add("cache");
  document.getElementById("titre-legende").textContent = "Classification du potentiel de mobilisation";

  EtatCarte.indicateurActuel = "score_final";
  rafraichirCouches(EtatInterface.resultats, EtatInterface.centroides);
  mettreAJourIndicateurCarte("Résultat général");
  mettreAJourProfilPanneau(); // si le panneau de droite est ouvert, on y remet le radar
}

function activerModeDetailFamille() {
  document.getElementById("case-resultat-general").checked = false;
  document.getElementById("case-detail-famille").checked = true;
  document.getElementById("selecteur-famille").classList.remove("cache");

  document.getElementById("tableau-legende-general").classList.add("cache");
  document.getElementById("tableau-legende-famille").classList.remove("cache");
  document.getElementById("titre-legende").textContent = "Aptitude à la famille de critères";

  const cleFamille = document.getElementById("selecteur-famille").value;
  EtatCarte.indicateurActuel = cleFamille;
  rafraichirCouches(EtatInterface.resultats, EtatInterface.centroides);
  mettreAJourIndicateurCarte(LIBELLES_FAMILLES[cleFamille]);
  mettreAJourProfilPanneau(); // si le panneau de droite est ouvert, on y montre le detail de cette famille
}

// le petit badge au-dessus de la carte qui rappelle ce qu'on est en train
// de regarder (score final ou une famille de criteres en particulier)
function mettreAJourIndicateurCarte(texte) {
  document.getElementById("indicateur-actif-carte").textContent = texte;
}

/* ============================================================
   fermeture automatique du panneau de detail des qu'on touche a un
   filtre de la sidebar (le detail affiche ne correspond plus forcement
   a ce qu'on voit sur la carte une fois le filtre change)
   ============================================================ */

function attacherFermetureAuChangementFiltre() {
  document.querySelectorAll('#barre-laterale input[type="checkbox"]').forEach(function (caseACocher) {
    // ces deux-la ne ferment pas le panneau : elles mettent a jour son
    // contenu (radar <-> detail de famille), cf mettreAJourProfilPanneau()
    if (caseACocher.id === "case-resultat-general" || caseACocher.id === "case-detail-famille") return;

    caseACocher.addEventListener("change", function () {
      if (!document.getElementById("panneau-detail").classList.contains("cache")) {
        fermerPanneauDetail();
      }
    });
  });
}

/* ============================================================
   sidebar : indicateur, filtre epci, limites administratives
   ============================================================ */

function attacherEvenementsSidebar() {
  // "Resultat general" et "Detail par famille" fonctionnent comme un
  // groupe de radio-boutons habilles en cases a cocher : un seul actif a
  // la fois, connecte a la fois a la couleur de la carte et a la legende
  document.getElementById("case-resultat-general").addEventListener("change", function (e) {
    if (e.target.checked) {
      activerModeResultatGeneral();
    } else {
      e.target.checked = true; // on ne peut pas tout decocher, il faut toujours un mode actif
    }
  });

  document.getElementById("case-detail-famille").addEventListener("change", function (e) {
    if (e.target.checked) {
      activerModeDetailFamille();
    } else {
      e.target.checked = true;
    }
  });

  document.getElementById("selecteur-famille").addEventListener("change", function (e) {
    EtatCarte.indicateurActuel = e.target.value;
    rafraichirCouches(EtatInterface.resultats, EtatInterface.centroides);
    mettreAJourIndicateurCarte(LIBELLES_FAMILLES[e.target.value]);
    mettreAJourProfilPanneau();
  });

  document.getElementById("case-labels").addEventListener("change", function (e) {
    EtatCarte.afficherLabels = e.target.checked;
    rafraichirCouches(EtatInterface.resultats, EtatInterface.centroides);
  });

  document.getElementById("case-filtrer-epci").addEventListener("change", function (e) {
    document.getElementById("selecteur-epci").disabled = !e.target.checked;
    EtatCarte.epciFiltre = e.target.checked ? document.getElementById("selecteur-epci").value : "";
    rafraichirCouches(EtatInterface.resultats, EtatInterface.centroides);
    if (e.target.checked && EtatCarte.epciFiltre) zoomVersEPCI(EtatCarte.epciFiltre);
  });

  document.getElementById("selecteur-epci").addEventListener("change", function (e) {
    if (document.getElementById("case-filtrer-epci").checked) {
      EtatCarte.epciFiltre = e.target.value;
      rafraichirCouches(EtatInterface.resultats, EtatInterface.centroides);
      if (e.target.value) zoomVersEPCI(e.target.value);
    }
  });

  // les 3 couches de limites administratives, chacune independante
  document.getElementById("case-limite-commune").addEventListener("change", function (e) {
    basculerCoucheLimite(EtatCarte.coucheCommunes, e.target.checked);
  });
  document.getElementById("case-limite-epci").addEventListener("change", function (e) {
    basculerCoucheLimite(EtatCarte.coucheEPCI, e.target.checked);
  });
  document.getElementById("case-limite-scot").addEventListener("change", function (e) {
    basculerCoucheLimite(EtatCarte.coucheSCoT, e.target.checked);
  });
}

function peuplerFiltreEPCI() {
  const selecteur = document.getElementById("selecteur-epci");
  const listeEpci = new Set();
  EtatInterface.resultats.features.forEach(function (f) {
    listeEpci.add(f.properties.epci);
  });
  Array.from(listeEpci)
    .sort()
    .forEach(function (epci) {
      const option = document.createElement("option");
      option.value = epci;
      option.textContent = epci;
      selecteur.appendChild(option);
    });
}

/* ============================================================
   bouton theme de l'entete
   ============================================================ */

function attacherEvenementsEntete() {
  document.getElementById("bouton-theme").addEventListener("click", basculerTheme);
}

/* ============================================================
   theme sombre / clair
   ============================================================ */

// au chargement de la page, on reprend le choix precedent de
// l'utilisateur (localStorage), sinon on reste en mode clair par defaut
function initTheme() {
  let themeSauvegarde = null;
  try {
    themeSauvegarde = localStorage.getItem("carte_reserves_theme");
  } catch (erreur) {
    // navigateur en navigation privee ou localStorage bloque -> tant pis,
    // on reste juste sur le theme par defaut
  }
  if (themeSauvegarde === "sombre") {
    document.body.classList.add("sombre");
  }
  mettreAJourIconeTheme();
}

function basculerTheme() {
  document.body.classList.toggle("sombre");
  mettreAJourIconeTheme();
  try {
    localStorage.setItem("carte_reserves_theme", document.body.classList.contains("sombre") ? "sombre" : "clair");
  } catch (erreur) {
    // pas grave si on ne peut pas sauvegarder, le theme s'appliquera quand meme pour cette session
  }
}

// seule l'icone change (le libelle "Activer / Desactiver le mode sombre"
// reste fixe, il decrit l'action du bouton quel que soit l'etat actuel)
function mettreAJourIconeTheme() {
  const icone = document.getElementById("icone-theme");
  const estSombre = document.body.classList.contains("sombre");
  icone.textContent = estSombre ? "☀️" : "🌙";
  document.getElementById("bouton-theme").title = estSombre ? "Passer en mode clair" : "Passer en mode sombre";
}
