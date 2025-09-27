import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
    apiKey: "AIzaSyCOM-WSSU6b_wWYc8ubN40vN_bWAHk_Qdk",
    authDomain: "debatetimer-tonyxyz.firebaseapp.com",
    databaseURL: "https://debatetimer-tonyxyz-default-rtdb.firebaseio.com",
    projectId: "debatetimer-tonyxyz",
    storageBucket: "debatetimer-tonyxyz.appspot.com",
    messagingSenderId: "142668218506",
    appId: "1:142668218506:web:a5287d45ee644df56c2d73",
    measurementId: "G-DSQFKSS077"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const database = getDatabase(app);

export { db, database };