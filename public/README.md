# Dossier Public

Ce dossier contient les fichiers statiques (images, vidéos, GIFs) accessibles publiquement.

## Comment ajouter des médias

1. **Copiez vos fichiers ici** :
   - Images : `.png`, `.jpg`, `.gif`, `.svg`
   - Vidéos : `.mp4`, `.webm`

2. **Utilisez-les dans le code** avec le chemin `/nom-fichier` :

```tsx
{/* Image */}
<img src="/demo.gif" alt="Démo" />

{/* Vidéo */}
<video autoPlay loop muted playsInline>
  <source src="/analyse-preview.mp4" type="video/mp4" />
</video>
```

## Exemples

```
public/
├── logo.png          → Accessible via /logo.png
├── demo.gif          → Accessible via /demo.gif
└── preview.mp4       → Accessible via /preview.mp4
```
