# Bachelor Game Show

A real-time game show application built with Next.js 14, Firebase, and TypeScript. Features live audience interaction, team scoring, and dynamic question reveals.

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
