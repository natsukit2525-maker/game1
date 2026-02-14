// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyAXDSefSfLcNQHZqRMpqej0qBmKtTtHhBo",
  authDomain: "game1-97a53.firebaseapp.com",
  databaseURL: "https://game1-97a53-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "game1-97a53",
  storageBucket: "game1-97a53.firebasestorage.app",
  messagingSenderId: "867624605844",
  appId: "1:867624605844:web:b9e0c3ad9331afc06ebc81",
  measurementId: "G-YYGLL0G11X"
};

// Firebaseの初期化（互換モード用の書き方）
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const database = firebase.database();

let roomID = "";
let gameRef;
let myRole = ""; 
let gameState = "ENTRY"; 
let onlineData = null;

let targetNumber, currentHand = [], currentVal = 0, startTime;
let operators = ['+', '-', '×', '÷'], selectedOpIdx = -1;

function setup() {
    createCanvas(600, 600);
    textAlign(CENTER, CENTER);
    frameRate(30);

    let params = getURLParams();
    if (params.room) {
        roomID = params.room;
        enterRoom(roomID);
    }
}

function enterRoom(id) {
    roomID = id;
    gameState = "LOADING";
    gameRef = database.ref("rooms/" + roomID);

    gameRef.on("value", (snapshot) => {
        onlineData = snapshot.val();
        syncGame();
    });

    assignRole();
}

async function assignRole() {
    const snapshot = await gameRef.once("value");
    const data = snapshot.val();
    
    if (!data || !data.p1Joined) {
        myRole = "P1";
        // P1が入る時は、前の試合のゴミが残らないよう set で初期化
        await gameRef.set({ 
            p1Joined: true, 
            p2Joined: false, 
            status: "WAITING_FOR_P2" 
        });
    } else if (!data.p2Joined) {
        myRole = "P2";
        // P2が参加したのと同時にゲームを開始させる
        // 2つの update を分けるとバグるので、resetOnlineGameの中でまとめて送る
        resetOnlineGame();
    } else {
        gameState = "FULL";
    }
}

async function resetOnlineGame() {
    const newTarget = floor(random(10, 91));
    const h1 = Array.from({length: 5}, () => floor(random(1, 10)));
    const h2 = Array.from({length: 5}, () => floor(random(1, 10)));
    
    // updateの内容を一つにまとめる
    // こうすることで「P2参加」と「ゲーム開始」が同時にFirebaseに書き込まれます
    await gameRef.update({
        p2Joined: true, // P2の参加もここで一緒に報告
        target: newTarget, 
        p1Hand: h1, 
        p2Hand: h2,
        p1Result: "none", // 数値以外の文字列を入れることで「未完了」を明示
        p1Time: "none",
        p2Result: "none",
        p2Time: "none",
        status: "PLAYING" // これで P1 が進めるようになる
    });
}
function syncGame() {
    if (!onlineData) return;

    if (onlineData.status === "PLAYING") {
        targetNumber = onlineData.target;
        
        // 1. 手札のセット
        if (currentHand.length === 0 && !hasFinished(myRole)) {
            currentHand = myRole === "P1" ? [...onlineData.p1Hand] : [...onlineData.p2Hand];
            startTime = millis();
        }

        // 2. 状態の更新
        let p1Done = typeof onlineData.p1Result === 'number';
        let p2Done = typeof onlineData.p2Result === 'number';

        if (p1Done && p2Done) {
            gameState = "RESULT";
        } else if (hasFinished(myRole)) {
            gameState = "FINISH_WAIT";
        } else {
            // ここで「まだ終わってないならPLAYINGに戻す」処理を入れるとより安全
            gameState = "PLAYING";
        }
    } else if (onlineData.status === "WAITING_FOR_P2") {
        gameState = "WAITING";
    }
}
function draw() {
    background(25);
    if (gameState === "ENTRY") drawEntryScreen();
    else if (gameState === "LOADING") drawMsg("接続中...");
    else if (gameState === "WAITING") drawWaitingScreen();
    else if (gameState === "PLAYING") drawPlayScreen();
    else if (gameState === "FINISH_WAIT") drawMsg("相手の終了を待っています...");
    else if (gameState === "RESULT") drawResult();
    else if (gameState === "FULL") drawMsg("この部屋は満員です");
}

function drawEntryScreen() {
    fill(255); textSize(32); text("SPEED NUMBER FORGE", width/2, 150);
    textSize(16); text("ルームIDを決めて入場してください", width/2, 220);
    drawBtn("入室 (ID: 123)", width/2, 300, 250, 50);
}

function drawWaitingScreen() {
    fill(255); textSize(20);
    text(`ROOM: ${roomID}`, width/2, 100);
    text("対戦相手を待っています...", width/2, height/2);
}

function drawPlayScreen() {
    // 自分が完了済みかチェック（hasFinished関数を使うように変更）
    if (hasFinished(myRole)) {
        gameState = "FINISH_WAIT";
        return;
    }

    fill(255, 215, 0); textSize(16); text("TARGET", width/2, 60);
    textSize(60); text(targetNumber, width/2, 105);
    fill(0, 255, 150); textSize(24); text("Value: " + currentVal, width/2, 170);

    // Cards
    rectMode(CENTER);
    for (let i = 0; i < 5; i++) {
        let x = 80 + i * 110; let y = 280;
        if (currentHand[i] !== null) {
            fill(240); rect(x, y, 85, 110, 10);
            fill(20); textSize(40); text(currentHand[i], x, y);
        } else {
            fill(50); rect(x, y, 85, 110, 10);
        }
    }
    // Operators
    for (let i = 0; i < 4; i++) {
        let x = 180 + i * 80; let y = 410;
        fill(selectedOpIdx === i ? color(255, 200, 0) : 255);
        ellipse(x, y, 55);
        fill(0); textSize(28); text(operators[i], x, y);
    }
    drawBtn("これで決定！", width/2, 520, 180, 50);
}

function drawResult() {
    fill(255); textSize(32); text("最終結果", width/2, 100);
    let d1 = abs(targetNumber - onlineData.p1Result);
    let d2 = abs(targetNumber - onlineData.p2Result);
    
    textSize(20);
    text(`P1: ${onlineData.p1Result} (差:${d1}) - ${onlineData.p1Time.toFixed(1)}s`, width/2, 200);
    text(`P2: ${onlineData.p2Result} (差:${d2}) - ${onlineData.p2Time.toFixed(1)}s`, width/2, 250);
    
    let winner = "";
    if (d1 < d2) winner = "P1 WIN!";
    else if (d2 < d1) winner = "P2 WIN!";
    else winner = onlineData.p1Time < onlineData.p2Time ? "P1 WIN!" : "P2 WIN!";
    
    fill(255, 215, 0); textSize(40); text(winner, width/2, 350);
    drawBtn("もう一度遊ぶ", width/2, 500, 180, 45);
}

function mousePressed() {
    if (gameState === "ENTRY") {
        if (isClick(width/2, 300, 250, 50)) enterRoom("123");
    } 
    else if (gameState === "PLAYING") {
        // Cards
        for (let i = 0; i < 5; i++) {
            if (currentHand[i] !== null && isClick(80 + i * 110, 280, 85, 110)) {
                if (currentVal === 0) { currentVal = currentHand[i]; currentHand[i] = null; }
                else if (selectedOpIdx !== -1) applyOp(i);
            }
        }
        // Ops
        for (let i = 0; i < 4; i++) {
            if (dist(mouseX, mouseY, 180 + i * 80, 410) < 27) selectedOpIdx = i;
        }
        if (isClick(width/2, 520, 180, 50)) finishTurn();
    }
    else if (gameState === "RESULT") {
        if (isClick(width/2, 500, 180, 45)) resetOnlineGame();
    }
}

function hasFinished(role) {
    if (!onlineData) return false;
    return role === "P1" ? typeof onlineData.p1Result === 'number' : typeof onlineData.p2Result === 'number';
}

function applyOp(idx) {
    let v = currentHand[idx];
    if (selectedOpIdx === 0) currentVal += v;
    else if (selectedOpIdx === 1) currentVal -= v;
    else if (selectedOpIdx === 2) currentVal *= v;
    else if (selectedOpIdx === 3 && v !== 0) currentVal = floor(currentVal / v);
    currentHand[idx] = null; selectedOpIdx = -1;
}

function finishTurn() {
    let time = (millis() - startTime) / 1000;
    // 確実に「数値」としてFirebaseに送る
    let updateData = {};
    if (myRole === "P1") {
        updateData.p1Result = Number(currentVal);
        updateData.p1Time = Number(time);
    } else {
        updateData.p2Result = Number(currentVal);
        updateData.p2Time = Number(time);
    }
    gameRef.update(updateData);
    
    currentHand = []; 
    gameState = "FINISH_WAIT"; // 送信直後に状態を切り替える
}
function isClick(x, y, w, h) {
    return mouseX > x - w/2 && mouseX < x + w/2 && mouseY > y - h/2 && mouseY < y + h/2;
}

function drawMsg(m) {
    fill(255); textSize(20); text(m, width/2, height/2);
}

function drawBtn(txt, x, y, w, h) {
    rectMode(CENTER); fill(100); rect(x, y, w, h, 8);
    fill(255); textSize(18); text(txt, x, y);
}
