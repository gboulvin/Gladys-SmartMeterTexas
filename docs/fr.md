# Smart Meter Texas

## Présentation

Cette intégration connecte Gladys à [Smart Meter Texas](https://www.smartmetertexas.com),
le portail où les gestionnaires de réseau texans (Oncor, CenterPoint, AEP Texas, TNMP)
publient les données des compteurs électriques communicants du marché ERCOT. C'est une
intégration **cloud**, disponible uniquement aux **États-Unis** (Texas).

Pour chaque compteur de votre compte, Gladys obtient un appareil avec trois fonctionnalités
en lecture seule :

- **Index du compteur** (kWh), issu d'un relevé à la demande ;
- **Consommation de la veille** (kWh), issue des données au quart d'heure ;
- **Surplus de production de la veille** (kWh) : l'énergie injectée sur le réseau par vos
  panneaux solaires.

Elle ajoute aussi :

- **Des déclencheurs de scène** : _Nouveau relevé du compteur_ (avec l'énergie consommée
  depuis le relevé précédent), _Consommation du jour disponible_ et _Échec du relevé_ ;
- **Des actions de scène** : _Relever un compteur_ et _Obtenir la consommation d'un jour
  passé_, dont les résultats sont utilisables par les actions suivantes de la scène ;
- **Un widget de tableau de bord** : index, consommation de la veille, graphique horaire et
  bouton **Relever**.

## Prérequis

- Gladys Assistant 5.3.0 ou plus récent.
- Un compte Smart Meter Texas (gratuit, créé sur smartmetertexas.com avec l'ESI ID et le
  numéro de compteur figurant sur votre facture). Les identifiants de votre fournisseur
  d'électricité ne fonctionnent **pas** ici.

## Configuration

1. Ouvrez **Intégrations → Smart Meter Texas → Configuration**.
2. Saisissez l'**identifiant** et le **mot de passe** de votre compte Smart Meter Texas.
3. Modifiez si besoin l'**intervalle de relevé** (60 minutes par défaut, 30 minimum) et
   l'option de **consommation de la veille**.
4. Cliquez sur **Tester la connexion** : le nombre de compteurs du compte s'affiche.
5. Ouvrez l'onglet **Découverte** et ajoutez votre ou vos compteurs.

Un relevé à la demande prend de quelques secondes à cinq minutes, et Smart Meter Texas
n'autorise que **deux relevés par compteur et par heure** : un second relevé à moins de
30 minutes est refusé par l'intégration. Les données au quart d'heure d'une journée sont en
général publiées le lendemain, parfois le surlendemain.

## Dépannage

- **« Smart Meter Texas a refusé l'identifiant ou le mot de passe »** : connectez-vous sur
  smartmetertexas.com avec les mêmes identifiants ; le portail bloque le compte après
  plusieurs échecs.
- **« Smart Meter Texas limite les requêtes »** : trop de connexions ou de relevés ;
  patientez une heure.
- **Pas de relevé après 5 minutes** : le compteur n'a pas répondu ; le prochain relevé
  planifié réessaiera. Le déclencheur _Échec du relevé_ permet d'être prévenu.
- **La consommation de la veille reste vide** : votre gestionnaire de réseau n'a pas encore
  publié les données ; l'intégration réessaie à chaque intervalle.
- Votre mot de passe est stocké par Gladys comme un secret et n'est jamais écrit dans les
  logs.
