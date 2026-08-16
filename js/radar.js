/* ==========================================================
   radar.js
   Dessine le graphique en radar (araignee) du profil multicritere
   de la reserve selectionnee, avec D3. Un seul mode desormais
   (familles), mais il est interactif :
   - survoler un sommet affiche son score au-dessus du point
   - cliquer sur un sommet affiche, sous le radar, le detail des
     sous-criteres de cette famille en valeurs brutes (celles d'avant
     la standardisation 0-1), pour comprendre d'ou vient le score
   ========================================================== */

const RADAR_LARGEUR = 300;
const RADAR_HAUTEUR = 250;
const RADAR_RAYON_MAX = 72;

// garde la reserve actuellement affichee dans le panneau, pour pouvoir
// remplir le tableau de detail quand on clique sur un sommet
let ReserveAffichee = null;

function dessinerRadarFamilles(feature) {
  ReserveAffichee = feature;
  mettreAJourProfilPanneau();
}

// decide quoi montrer dans le panneau, entre le radar (mode "Resultat
// general") et le detail des sous-criteres d'une famille (mode "Detail de
// l'analyse par famille de criteres"). appelee a chaque fois qu'on change
// de reserve, de mode, ou de famille dans le selecteur de la sidebar.
function mettreAJourProfilPanneau() {
  if (!ReserveAffichee) return; // pas de reserve selectionnee, rien a mettre a jour

  const props = ReserveAffichee.properties;

  if (EtatCarte.indicateurActuel === "score_final") {
    // bloc score/classe/rang : version "resultat general"
    document.getElementById("label-score-principal").textContent = "Score final";
    document.getElementById("valeur-score-final").textContent = props.score_final.toFixed(2).replace(".", ",");
    document.getElementById("valeur-classe").textContent = props.classe_apt;
    document.getElementById("valeur-classe").style.color = COULEURS_CLASSES[classeDepuisValeur(props.score_final)];
    document.getElementById("ligne-rang").classList.remove("cache");
    document.getElementById("valeur-rang").textContent = props.rang + " / " + EtatInterface.resultats.features.length;

    document.getElementById("titre-profil").textContent = "Profil multicritère de la réserve";
    document.getElementById("bloc-radar").classList.remove("cache");
    document.getElementById("detail-famille-clic").classList.add("cache");

    const axes = Object.keys(LIBELLES_FAMILLES_COURT).map(function (cle) {
      return {
        cle: cle,
        libelle: LIBELLES_FAMILLES_COURT[cle],
        valeur: props[cle],
      };
    });
    dessinerRadar(axes);
  } else {
    // bloc score/classe/rang : version "detail par famille" -> le score et
    // la classe concernent la famille choisie, pas le score final de la
    // reserve, et le rang n'a pas de sens ici (on ne classe pas les
    // reserves par famille de critere)
    const cleFamille = EtatCarte.indicateurActuel;
    const valeurFamille = props[cleFamille];
    const classeInterne = classeDepuisValeur(valeurFamille); // "Potentiel faible/modere/eleve"

    document.getElementById("label-score-principal").textContent = "Score de la famille de critères";
    document.getElementById("valeur-score-final").textContent = valeurFamille.toFixed(2).replace(".", ",");
    document.getElementById("valeur-classe").textContent = CORRESPONDANCE_APTITUDE[classeInterne];
    document.getElementById("valeur-classe").style.color = COULEURS_CLASSES[classeInterne];
    document.getElementById("ligne-rang").classList.add("cache");

    document.getElementById("titre-profil").textContent = "Détail de la famille de critères";
    document.getElementById("bloc-radar").classList.add("cache");

    // en mode "detail par famille", le radar n'a plus de sens ici : on
    // affiche directement le detail de la famille actuellement choisie
    // dans la sidebar, sans avoir besoin de cliquer sur un sommet
    afficherDetailFamille(cleFamille, LIBELLES_FAMILLES[cleFamille]);
    document.getElementById("sous-titre-detail-famille").classList.add("cache");
  }
}

function dessinerRadar(axes) {
  const conteneur = d3.select("#radar-conteneur");
  conteneur.selectAll("*").remove(); // on repart d'une feuille blanche a chaque appel

  const centre = { x: RADAR_LARGEUR / 2, y: RADAR_HAUTEUR / 2 };
  const nbAxes = axes.length;
  const angleParAxe = (2 * Math.PI) / nbAxes;

  const svg = conteneur
    .append("svg")
    .attr("viewBox", `0 0 ${RADAR_LARGEUR} ${RADAR_HAUTEUR}`)
    .style("width", "100%")
    .style("height", "auto");

  // grille de fond : 4 cercles concentriques a 25 / 50 / 75 / 100 %
  const niveauxGrille = [0.25, 0.5, 0.75, 1];
  niveauxGrille.forEach(function (niveau) {
    svg
      .append("circle")
      .attr("class", "grille-radar")
      .attr("cx", centre.x)
      .attr("cy", centre.y)
      .attr("r", niveau * RADAR_RAYON_MAX);
  });

  // un axe (ligne + etiquette) par famille de critere
  axes.forEach(function (axe, i) {
    const angle = angleParAxe * i - Math.PI / 2; // angle 0 = tout en haut
    const xBout = centre.x + RADAR_RAYON_MAX * Math.cos(angle);
    const yBout = centre.y + RADAR_RAYON_MAX * Math.sin(angle);

    svg
      .append("line")
      .attr("class", "grille-radar")
      .attr("x1", centre.x)
      .attr("y1", centre.y)
      .attr("x2", xBout)
      .attr("y2", yBout);

    const xLabel = centre.x + (RADAR_RAYON_MAX + 20) * Math.cos(angle);
    const yLabel = centre.y + (RADAR_RAYON_MAX + 20) * Math.sin(angle);
    let ancrage = "middle";
    if (Math.cos(angle) > 0.25) ancrage = "start";
    else if (Math.cos(angle) < -0.25) ancrage = "end";

    const texte = svg
      .append("text")
      .attr("class", "axe-radar")
      .attr("x", xLabel)
      .attr("y", yLabel)
      .attr("text-anchor", ancrage)
      .attr("dominant-baseline", "middle");

     ecrireLibelleMultiligne(texte, axe.libelle, xLabel, ancrage);
  });

  // coordonnees de chaque sommet (on garde l'axe d'origine associe a
  // chaque point, pour retrouver sa valeur/cle au survol et au clic)
  const points = axes.map(function (axe, i) {
    const angle = angleParAxe * i - Math.PI / 2;
    const r = Math.max(0, Math.min(1, axe.valeur)) * RADAR_RAYON_MAX;
    return { x: centre.x + r * Math.cos(angle), y: centre.y + r * Math.sin(angle), axe: axe };
  });

  const generateurLigne = d3
    .line()
    .x(function (p) {
      return p.x;
    })
    .y(function (p) {
      return p.y;
    })
    .curve(d3.curveLinearClosed);

  svg.append("path").attr("class", "aire-radar").attr("d", generateurLigne(points));

  // les points + leur zone interactive (survol = score, clic = detail).
  // l'etiquette de survol est ajoutee en dernier pour rester au-dessus
  // de tout le reste du dessin
  const cerclesPoints = points.map(function (p) {
    return svg
      .append("circle")
      .attr("class", "point-radar")
      .attr("cx", p.x)
      .attr("cy", p.y)
      .attr("r", 4);
  });

  const etiquetteSurvol = svg
    .append("text")
    .attr("class", "etiquette-survol-radar")
    .style("display", "none");

  points.forEach(function (p, i) {
    const cercle = cerclesPoints[i];

    // zone de clic invisible plus large que le point, plus confortable
    // a viser qu'un cercle de 4px de rayon
    const zoneInteractive = svg
      .append("circle")
      .attr("cx", p.x)
      .attr("cy", p.y)
      .attr("r", 13)
      .attr("fill", "transparent")
      .style("cursor", "pointer");

    function survolEntree() {
      cercle.attr("r", 5.5);
      etiquetteSurvol
        .attr("x", p.x)
        .attr("y", Math.max(10, p.y - 12))
        .text(p.axe.valeur.toFixed(2).replace(".", ","))
        .style("display", "block");
    }

    function survolSortie() {
      cercle.attr("r", 4);
      etiquetteSurvol.style("display", "none");
    }

    function clic() {
      afficherDetailFamille(p.axe.cle, LIBELLES_FAMILLES[p.axe.cle]);
      // ici on vient du clic sur un sommet (mode "Resultat general", radar
      // toujours affiche) -> le sur-titre precise de quel type de detail
      // il s'agit, contrairement au mode "Detail par famille" ou le titre
      // principal du panneau le dit deja
      document.getElementById("sous-titre-detail-famille").classList.remove("cache");
    }

    zoneInteractive.on("mouseenter", survolEntree).on("mouseleave", survolSortie).on("click", clic);
  });
}

// coupe un libelle en plusieurs lignes courtes (plutot qu'en 2 lignes fixes) :
// avec des libelles aussi longs que "Enjeux forestiers et environnementaux",
// 2 lignes suffisaient pas et le texte depassait du svg (il se faisait rogner
// sur le bord gauche ou droit). le bloc est aussi recentre verticalement
// autour du point d'ancrage, sinon il partait vers le bas quel que soit le
// nombre de lignes
function ecrireLibelleMultiligne(selectionTexte, libelle, x, ancrage) {
  const maxCaracteresParLigne = ancrage === "middle" ? 24 : 11;
  const mots = libelle.split(" ");
  const lignes = [];
  let ligneActuelle = "";

  mots.forEach(function (mot) {
    const essai = ligneActuelle ? ligneActuelle + " " + mot : mot;
    if (essai.length > maxCaracteresParLigne && ligneActuelle) {
      lignes.push(ligneActuelle);
      ligneActuelle = mot;
    } else {
      ligneActuelle = essai;
    }
  });
  if (ligneActuelle) lignes.push(ligneActuelle);

  const decalageDepart = -((lignes.length - 1) / 2) * 1.15;
  lignes.forEach(function (ligne, i) {
    selectionTexte
      .append("tspan")
      .attr("x", x)
      .attr("dy", (i === 0 ? decalageDepart : 1.15) + "em")
      .text(ligne);
  });
}

/* ============================================================
   detail d'une famille au clic sur un sommet du radar : les sous-criteres
   de cette famille avec leur valeur brute (celle d'avant standardisation,
   ex. "Plus de 10 minutes"), pour comprendre d'ou vient le score
   ============================================================ */

function afficherDetailFamille(cleFamille, libelleFamille) {
  if (!ReserveAffichee) return;

  const props = ReserveAffichee.properties;
  const sousCriteres = SOUS_CRITERES_PAR_FAMILLE[cleFamille] || [];

  document.getElementById("titre-detail-famille").textContent = libelleFamille;

  const corps = document.querySelector("#tableau-detail-famille tbody");
  corps.innerHTML = "";

  sousCriteres.forEach(function (cleStandardisee) {
    // chaque cle "std_xxx" a sa valeur brute (avant standardisation) dans
    // le champ "xxx" du meme geojson
    const cleBrute = cleStandardisee.replace(/^std_/, "");
    const valeurBrute = props[cleBrute];

    const ligne = document.createElement("tr");
    ligne.innerHTML =
      "<td>" + LIBELLES_SOUS_CRITERES[cleStandardisee] + "</td><td>" + formaterValeurBrute(valeurBrute) + "</td>";
    corps.appendChild(ligne);
  });

  document.getElementById("detail-famille-clic").classList.remove("cache");
}

function formaterValeurBrute(valeur) {
  if (valeur === null || valeur === undefined || valeur === "") return "Non renseigné";
  return valeur;
}
