# Carte interactive des réserves foncières économiques

Carte de restitution des résultats de l'analyse multicritère, réalisée en HTML / CSS / JavaScript avec Leaflet (carte + clusters) et D3 (radar). Aucun framework, aucune dépendance à installer — juste des fichiers statiques.

## Lancer le projet en local 

Le fichier `index.html` charge les GeoJSON via `fetch()`, ce qui ne fonctionne pas en ouvrant directement le fichier avec `file://` (bloqué par le navigateur). Il faut servir le dossier avec un petit serveur local, par exemple :

```bash
cd carte_reserves
python3 -m http.server 8000
```

Puis ouvrir `http://localhost:8000` dans le navigateur.

## Fonctionnalités

**Deux modes d'affichage** :
- **Résultat général** : colore les réserves selon le score final, légende "Classification du potentiel de mobilisation" (3 classes), panneau de droite avec radar.
- **Détail de l'analyse par famille de critères** : un sélecteur apparaît pour choisir la famille (4 possibles), colore les réserves selon le score de cette famille, légende "Aptitude à la famille de critères" (favorable/modérée/défavorable).

**Carte** :
- Clusters de points à faible zoom, qui éclatent en parcelles + contours de zonage économique au-delà du zoom 13 (`SEUIL_ZOOM_DETAIL`) ou au clic sur un cluster.
- 3 fonds de carte au choix (menu en haut à droite) : clair (Positron, par défaut), OSM standard, satellite (Google).
- Limites administratives (communes, EPCI, périmètre du SCoT) affichées à tous les niveaux de zoom, chacune activable/désactivable indépendamment.
- Bouton "Réinitialiser la carte" (revient à l'emprise de départ) et "Afficher l'aide" (ouverte par défaut au chargement).
- Badge en haut de la carte rappelant ce qui est affiché ("Résultat général" ou le nom de la famille regardée).
- Petit cadre de légende des tracés en bas à droite de la carte.

**Panneau de détail** (clic sur une réserve pour afficher ses détails) : EPCI, commune, surface, score et classification, puis soit le radar des 4 familles (mode "Résultat général" — survol = score, clic sur un sommet = détail des sous-critères en valeurs brutes), soit directement le détail de la famille choisie (mode "Détail par famille").

**Mode sombre/clair** (bouton dans l'en-tête), mémorisé d'une visite à l'autre via `localStorage`.

## Données

Les fichiers dans `data/` sont les exports de l'analyse via le plugin QGIS.

- **`Resultat_RF_ahp.geojson`** — polygones des parcelles. Champs utilisés : `ID`, `commune`, `epci`, `superficie_ha`, `score_final`, `classe_apt`, `rang`, les 4 scores des familles de critères (`mf_attractivite_geog`, `mf_aptitude_aux_rese`, `mf_enjeux_forestiers`, `mf_aptitude_physique`), les 15 sous-critères standardisés (`std_...`, valeurs 0-1) et leurs valeurs d'observations brutes non standardisées, affichées dans le tableau de détail au clic sur un sommet du radar.
- **`Centroide_RF.geojson`** — mêmes propriétés, géométrie `Point` (centroïde de chaque parcelle). Sert à la couche de clusters. 
- **`Contours_zonage_eco.geojson`** — contours de zonage économique, affichés à partir du zoom détaillé ou après un clic sur un cluster. 
- **`COMMUNE.geojson`**, **`EPCI.geojson`**, **`SCOTERS.geojson`** — limites administratives du territoire d'étude.

### Classification

3 classes, seuils `< 0,33`, `0,33 – 0,67`, `≥ 0,67`. La couleur affichée (sur la carte et dans le panneau) est **recalculée depuis le score numérique** (`classeDepuisValeur()` dans `carte.js`, valeur arrondie à 2 décimales avant comparaison).

## Architecture du dossier 

| Fichier | Contenu |
|---|---|
| `index.html` | Structure de la page et tous les textes visibles (titres, libellés, aide, méthodologie...) |
| `css/style.css` | Couleurs, tailles, thème clair/sombre (variables `--couleur-...` dans `:root` / `body.sombre`) |
| `js/carte.js` | Carte Leaflet, couches, couleurs des classifications, zoom de bascule clusters/parcelles |
| `js/radar.js` | Graphique radar et tableau de détail par famille de critères |
| `js/interface.js` | Cases à cocher, sélecteurs, ouverture/fermeture du panneau, bascule des deux modes |
| `data/*.geojson` | Les données |

