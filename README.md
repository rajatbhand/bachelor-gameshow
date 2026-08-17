# Bachelor Game Show — no-server BACKUP edition

A real-time game show application built with Next.js 14, Firebase, and TypeScript. Features live audience interaction, team scoring, and dynamic question reveals.

> **This is the backup.** The primary deployment is `../bachelor-gameshow-live/`,
> where a Node server owns the game state. This app talks straight to Firestore
> with no server at all, which is exactly what makes it the thing you switch to
> when the server dies. Both run against the same Firebase project as each
> other, so scores, the board and the timeline carry over.
>
> Full show-day runbook: [`../bachelor-gameshow-live/README.md`](../bachelor-gameshow-live/README.md).

## Failover

`control/mode.backupMode` decides who owns the show. Press **TAKE CONTROL** on
this app's `/control` — the live server stops mirroring and this panel becomes
the authority. The switch is written straight to Firestore, so it works when the
server is unreachable.

Once you have taken control, **do not hand it back mid-show** — both apps would
then be writing `gameState/live`.

## Where this deploys

Two Firebase projects, matching the two branches:

| branch | project | backup app | live app |
|---|---|---|---|
| `ach` (latest) | `akal-ke-ghode-test` | https://akal-ke-ghode-test.web.app | https://akal-ke-ghode-live.web.app |
| `master` | `bachelore-gameshow` | https://bachelore-gameshow.web.app | https://bachelore-gameshow-live.web.app |

Each project hosts both apps on separate hosting sites, wired as deploy targets
(`backup` and `live`), so the two never deploy over each other. The backup keeps
its existing URLs.

```bash
npm run deploy:test        # -> akal-ke-ghode-test  (branch `ach`)
npm run deploy:prod        # -> bachelore-gameshow  (branch `master`)
```

## Upgrading the deployed site

Deploy in this order, outside a show:

1. `npm run deploy:test` — the new bundle.
2. `npm run deploy:rules:test` — the rules.

Existing game state needs no migration. `teamMode`/`activeTeams` are backfilled
the first time the control panel loads, and older game states default to three
horses.

## A note on voter data

The control panel has no login — you press the export button and get the
workbook. That is a deliberate choice, and it has a cost: because this app has
no server, Firestore cannot tell the control panel apart from a stranger, so
`audience` documents stay **readable by anyone who knows the project id**. They
contain voter name, phone number and UPI id.

Writes *are* locked down — a voter can only create and edit their own record, so
nobody can stuff the ballot or rewrite someone else's vote.

If you ever want to close the read hole: add an `operators/{uid}` allowlist
document per crew member, gate the `audience` read on it in `firestore.rules`,
and sign the control panel in with that account. It is a one-time sign-in per
laptop, not a per-show step.

The server-backed app in `../bachelor-gameshow-live/` does not have this
exposure at all — voter data never leaves its server except to an authenticated
operator.

## What this app also has

The 2v2 format picker, the two-sheet Excel export (votes + game timeline), and
live question editing all work here exactly as they do in the live app; see the
runbook linked above.

## 🚀 Features

- **Real-time Updates**: Firebase Firestore for instant synchronization
- **Control Panel**: Complete game operator interface
- **Display Screen**: TV/audience view with live updates
- **Audience Voting**: Mobile-friendly team selection
- **Bachelor Questions**: 6 pre-loaded questions with answers
- **Score Management**: Manual score adjustments and Round 2 bonuses
- **Overlays**: Big X, Scorecard, and Logo screens

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Firebase Firestore
- **Hosting**: Firebase Hosting
- **Real-time**: Firebase Realtime Database

## 📋 Prerequisites

- Node.js 18+ 
- npm or yarn
- Firebase account
- Git

## 🔧 Setup Instructions

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd bachelor-gameshow
npm install
```

### 2. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable Firestore Database
4. Go to Project Settings > General
5. Add a web app and copy the config

### 3. Configure Firebase

Update `src/lib/firebase.ts` with your Firebase config:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "your-app-id"
};
```

### 4. Install Firebase CLI

```bash
npm install -g firebase-tools
firebase login
firebase init
```

Select:
- Firestore
- Hosting
- Use existing project
- Public directory: `out`
- Single-page app: `Yes`

### 5. Run Development Server

```bash
npm run dev
```

Visit:
- **Home**: http://localhost:3000
- **Control Panel**: http://localhost:3000/control
- **Display**: http://localhost:3000/display
- **Audience**: http://localhost:3000/audience

## 🎮 How to Use

### Control Panel (`/control`)
- **Load Questions**: Click "LOAD BACHELOR QUESTIONS" to load all 6 questions
- **Select Question**: Choose a question from the list
- **Round Control**: Switch between Pre-show, Round 1, 2, 3, Final
- **Team Selection**: Set active team (Red, Green, Blue, Host)
- **Answer Reveals**: Click team buttons to reveal answers
- **Score Management**: Use +/- buttons to adjust scores
- **Overlays**: Toggle Big X, Scorecard, Logo screens
- **Audience Voting**: Open/close voting window
- **Round 2 Bonus**: Apply multipliers for correct answers

### Display (`/display`)
- Shows current question and answers
- Real-time score updates
- Team attribution colors
- Overlay displays (Big X, Scorecard, Logo)

### Audience (`/audience`)
- Mobile-friendly team selection
- Name and phone number collection
- Real-time voting status
- One submission per phone number

## 🚀 Deployment

### Firebase Hosting

```bash
npm run deploy
```

This will:
1. Build the application
2. Deploy to Firebase Hosting
3. Provide a public URL

### Custom Domain

1. Go to Firebase Console > Hosting
2. Add custom domain
3. Update DNS records
4. Wait for SSL certificate

## 📁 Project Structure

```
bachelor-gameshow/
├── src/
│   ├── app/
│   │   ├── control/          # Control panel
│   │   ├── display/          # TV display
│   │   ├── audience/         # Audience voting
│   │   └── page.tsx          # Home page
│   └── lib/
│       ├── firebase.ts       # Firebase config
│       ├── gameState.ts      # Game state management
│       └── questions.ts      # Question data
├── firebase.json             # Firebase config
├── firestore.rules           # Security rules
└── firestore.indexes.json    # Database indexes
```

## 🎯 Game Flow

1. **Pre-show**: Logo screen, audience voting
2. **Round 1**: First question with team reveals
3. **Round 2**: Second question with bonus multipliers
4. **Round 3**: Final question with 4-6 answers
5. **Final**: Scorecard display

## 🔧 Customization

### Adding Questions

Edit `src/lib/questions.ts`:

```typescript
export const bachelorQuestions: Question[] = [
  {
    id: 'Q7',
    text: "Your new question here?",
    answerCount: 6,
    answers: [
      { id: 'Q7A1', text: 'Answer 1', value: 15, revealed: false, attribution: null },
      // ... more answers
    ]
  }
];
```

### Styling

Modify Tailwind classes in components or update `tailwind.config.ts`

### Firebase Rules

Update `firestore.rules` for production security

## 🐛 Troubleshooting

### Common Issues

1. **Firebase Connection**: Check config in `firebase.ts`
2. **Build Errors**: Run `npm run build` to check for issues
3. **Real-time Updates**: Ensure Firestore is enabled
4. **Deployment**: Check Firebase CLI is logged in

### Development Tips

- Use Firebase Emulator for local development
- Check browser console for errors
- Test on different screen sizes
- Verify real-time updates work

## 📞 Support

For issues or questions:
1. Check Firebase Console logs
2. Review browser console errors
3. Verify network connectivity
4. Test with different browsers

## 📄 License

This project is for educational and entertainment purposes.

---

**Built with ❤️ using Next.js and Firebase**
