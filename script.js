        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
        import { getFirestore, collection, onSnapshot, query, orderBy, setDoc, doc, getDoc, updateDoc, increment, serverTimestamp, addDoc, limit, getDocs, where, deleteDoc} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

        const firebaseConfig = {
            apiKey: "AIzaSyCi-Tjj5gTUzNvCtxi1gFZKRTrIqbOrE8I",
            authDomain: "the-berry-lane-saloon.firebaseapp.com",
            projectId: "the-berry-lane-saloon",
            storageBucket: "the-berry-lane-saloon.firebasestorage.app",
            messagingSenderId: "696171119297",
            appId: "1:696171119297:web:4959d0a45349dde66a4a40",
            measurementId: "G-SF2E2EX7JR"
        };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);

        const menuData = [
            { n: 'Whisky', p: 4, r: '2x Kukurydza, 1x Woda' },
            { n: 'Piwo', p: 3, r: '2x Pszenica, 1x Woda' },
            { n: 'Zupa warzywna', p: 5, r: '2x Marchewka, 2x Ziemniak' },
            { n: 'Ciasto jagody', p: 6, r: '2x Pszenica, 2x Mleko, 2x Jajko, 2x Jagoda' },
            { n: 'Kawa', p: 2, r: '2x Woda' },
            { n: 'Wino', p: 3, r: '2x Jabłko, 1x Woda' },
            { n: 'Śniadanie', p: 6, r: '2x Mięso, 1x Jajko, 1x Woda' },
            { n: 'Ryba z Ziemniakami', p: 6, r: '3x Ryba, 2x Ziemniak' },
            { n: 'Ciasto kura', p: 7, r: '2x Drób, 2x Pszenica, 2x Jajko' },
            { n: 'Piwo malina', p: 4, r: '2x Malina, 1x Woda' },
            { n: 'Placek wołowy', p: 8, r: '2x Wołowina, 2x Pszenica, 2x Jajko' }
        ];

        menuData.forEach(m => {
            document.getElementById('products').innerHTML += `<button class="product-btn" onclick="addToReceipt('${m.n}', ${m.p})"><strong>${m.n}</strong><span>$${m.p}.00</span></button>`;
            document.getElementById('kitchen-recipes').innerHTML += `<div class="recipe-card"><h3>${m.n}</h3><ul><li>${m.r}</li></ul></div>`;
            document.getElementById('calc-inputs').innerHTML += `
                <div class="calc-row">
                    <span style="color:var(--parchment); font-family:'Rye'; font-size:0.9em;">${m.n}</span>
                    <input type="number" min="0" value="0" class="calc-input" data-name="${m.n}" oninput="calculateIngredients()">
                </div>
            `;
        });

        window.calculateIngredients = () => {
            let totals = {};
            document.querySelectorAll('.calc-input').forEach(input => {
                let qty = parseInt(input.value) || 0;
                if (qty > 0) {
                    let prodName = input.dataset.name;
                    let menuItem = menuData.find(m => m.n === prodName);
                    if (menuItem) {
                        let parts = menuItem.r.split(', ');
                        parts.forEach(p => {
                            let [ingQtyStr, ingName] = p.split('x ');
                            let ingQty = parseInt(ingQtyStr) * qty;
                            totals[ingName] = (totals[ingName] || 0) + ingQty;
                        });
                    }
                }
            });
            let resHtml = '';
            for (let ing in totals) {
                resHtml += `<li style="margin-bottom:10px; border-bottom:1px dashed #4a3625; padding-bottom:5px;"><span style="color:var(--gold); font-weight:bold; font-size:1.2em; display:inline-block; width:45px;">${totals[ing]}x</span> ${ing}</li>`;
            }
            if(resHtml === '') resHtml = '<li style="opacity:0.5;">Wybierz coś z listy obok, aby przeliczyć...</li>';
            document.getElementById('calc-results').innerHTML = resHtml;
        };

        window.clearCalculator = () => {
            document.querySelectorAll('.calc-input').forEach(input => input.value = 0);
            window.calculateIngredients();
        };

        window.openModal = (title, msg, onConfirm) => {
            document.getElementById('modal-title').innerText = title;
            document.getElementById('modal-message').innerText = msg;
            document.getElementById('modal-overlay').style.display = 'flex';
            document.getElementById('modal-confirm-btn').onclick = () => { onConfirm(); closeModal(); };
        };
        window.closeModal = () => { document.getElementById('modal-overlay').style.display = 'none'; };

        let activeSessionName = "Zmiana_1", statsStartTime = null;
        let currentTaxDue = 0;

        async function init() {
            const snap = await getDoc(doc(db, "pos_metadata", "current_session"));
            if(snap.exists()){
                const d = snap.data();
                activeSessionName = "Zmiana_nr_" + (d.sessionNumber || 1);
                statsStartTime = d.globalStatsResetTime ? d.globalStatsResetTime.toDate() : new Date(0);
                document.getElementById('last-reset-date').innerText = statsStartTime.toLocaleDateString();
            } else {
                statsStartTime = new Date();
                await setDoc(doc(db, "pos_metadata", "current_session"), { sessionNumber: 1, globalStatsResetTime: serverTimestamp() });
                activeSessionName = "Zmiana_nr_1";
            }
            document.getElementById('session-display').innerText = "BIEŻĄCA ZMIANA: " + activeSessionName;
            document.getElementById('session-name-title').innerText = activeSessionName;

            const taxSnap = await getDoc(doc(db, "pos_metadata", "tax_info"));
            if(!taxSnap.exists()){
                await setDoc(doc(db, "pos_metadata", "tax_info"), { nextDate: "2026-03-21", archive: [] });
            }

            startListen();
            listenToTaxes();
            listenToPayouts();
        }
        init();

        window.switchTab = (n) => {
            document.querySelectorAll('.tab-content, .tab-btn').forEach(el => el.classList.remove('active'));
            document.getElementById('tab-'+n).classList.add('active');
            event.currentTarget.classList.add('active');
        };

        let currentReceipt = []; let currentTotal = 0;
        window.addToReceipt = (name, price) => {
            const menuItem = menuData.find(m => m.n === name);

if(menuItem && menuItem.components){
    for(const c of menuItem.components){
        if(productsData[c.name] < c.qty){
            showCustomAlert("Brak produktu: " + c.name);
            return;
        }
    }

    for(const c of menuItem.components){
        window.updatePosProduct(c.name, -c.qty);
    }
}

            if (window.updatePosProduct && productsData[name] !== undefined) {
        if (productsData[name] > 0) {
            window.updatePosProduct(name, -1);
        } else {
            showCustomAlert("Brak produktu na stanie!");
            return; // Zatrzymuje dodawanie do koszyka!
        }
    }
            const item = currentReceipt.find(i => i.name === name);
            if(item) item.quantity++; else currentReceipt.push({name, price, quantity: 1});
            updateUI();
        };
        window.clearReceipt = (isCancel = false) => { 
    // Jeśli anulujemy rachunek (kliknięcie czerwonego przycisku), zwracamy towar na stan
    if (isCancel === true) {
        currentReceipt.forEach(item => {

    const menuItem = menuData.find(m => m.n === item.name);

    // jeśli to zestaw
    if(menuItem && menuItem.components){
        menuItem.components.forEach(c=>{
            if(window.updatePosProduct){
                window.updatePosProduct(c.name, c.qty * item.quantity);
            }
        });
    }

    // jeśli to zwykły produkt
    else if (window.updatePosProduct && productsData[item.name] !== undefined) {
        window.updatePosProduct(item.name, item.quantity); 
    }

});

    }
    
    currentReceipt = []; 
    currentTotal = 0; 
    updateUI(); 
};
        // --- SYSTEM BUDOWANIA ZESTAWÓW NA STRONIE ---
        window.openBuilder = () => {
            let listHtml = '';
            menuData.forEach(m => {
                if(!m.isCustom) { // Pokazujemy tylko bazowe produkty
                    listHtml += `
                    <label style="display: flex; align-items: center; padding: 8px; cursor: pointer; border-bottom: 1px solid #3b2f25;">
                        <input type="checkbox" value="${m.n}" class="builder-cb" style="width: 20px; height: 20px; margin-right: 15px; accent-color: var(--gold);">
                        <span style="color: var(--parchment); font-weight: bold; font-size: 1.1em;">${m.n}</span>
                    </label>`;
                }
            });
            document.getElementById('builder-list').innerHTML = listHtml;
            document.getElementById('builder-name').value = '';
            document.getElementById('builder-price').value = '';
            document.getElementById('builder-modal').style.display = 'flex';
        };

        // --- SYSTEM BUDOWANIA ZESTAWÓW NA STRONIE ---
        window.openBuilder = () => {
            // Dodajemy ładne style dla checkboxów
            let listHtml = `
            <style>
                .builder-item { display: flex; align-items: center; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; cursor: pointer; transition: all 0.2s; border: 1px solid transparent; }
                .builder-item:hover { background: rgba(209, 178, 111, 0.1); border-color: rgba(209, 178, 111, 0.3); }
                .builder-cb-input { display: none; }
                .builder-box { width: 22px; height: 22px; border: 2px solid var(--gold); border-radius: 4px; margin-right: 15px; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); transition: all 0.2s; }
                .builder-cb-input:checked + .builder-box { background: var(--gold); box-shadow: 0 0 8px rgba(209, 178, 111, 0.4); }
                .builder-cb-input:checked + .builder-box::after { content: '✔'; color: #000; font-weight: bold; font-size: 16px; }
            </style>`;

            menuData.forEach(m => {
                if(!m.isCustom) { // Pokazujemy tylko bazowe produkty
                    listHtml += `
                    <label class="builder-item">
                        <input type="checkbox" value="${m.n}" class="builder-cb builder-cb-input">
                        <div class="builder-box"></div>
                        <span style="color: var(--parchment); font-weight: bold; font-size: 1.1em; font-family: 'Roboto';">${m.n}</span>
                    </label>`;
                }
            });
            document.getElementById('builder-list').innerHTML = listHtml;
            document.getElementById('builder-name').value = '';
            document.getElementById('builder-price').value = '';
            document.getElementById('builder-modal').style.display = 'flex';
        };

        // --- LOGIKA KREATORA ZESTAWÓW ---
        window.openBuilder = () => {
            let listHtml = `
            <style>
                .builder-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; margin-bottom: 6px; border-radius: 4px; border: 1px solid transparent; }
                .builder-item:hover { background: rgba(209, 178, 111, 0.1); border-color: rgba(209, 178, 111, 0.3); }
                .builder-qty { width: 60px; background: #17120e; color: var(--gold); border: 1px solid var(--gold); padding: 8px; text-align: center; font-family: 'Rye'; font-size: 1.1em; border-radius: 4px; outline: none; }
            </style>`;

            menuData.forEach(m => {
                if(!m.isCustom) {
                    listHtml += `
                    <label class="builder-item">
                        <span style="color: var(--parchment); font-weight: bold; font-size: 1.1em; font-family: 'Roboto';">${m.n}</span>
                        <input type="number" min="0" max="99" value="0" class="builder-qty" data-name="${m.n}">
                    </label>`;
                }
            });
            document.getElementById('builder-list').innerHTML = listHtml;
            document.getElementById('builder-price').value = '';
            document.getElementById('builder-modal').style.display = 'flex';
        };

        window.closeBuilder = () => { document.getElementById('builder-modal').style.display = 'none'; };

        window.saveComboToMenu = () => {
            const inputs = document.querySelectorAll('.builder-qty');
            const price = parseFloat(document.getElementById('builder-price').value);

            let selectedNames = []; 
            let recipes = [];
            let hasItems = false;
            
            inputs.forEach(input => {
                let qty = parseInt(input.value);
                if (qty > 0) {
                    hasItems = true;
                    let productName = input.getAttribute('data-name');
                    
                    // Dodaje ilość np. "3x Piwo"
                    selectedNames.push(`${qty}x ${productName}`);
                    
                    let product = menuData.find(m => m.n === productName);
                    if(product && product.r) {
                        // Klonuje przepis, jeśli wybrano więcej niż 1 sztukę
                        for(let i = 0; i < qty; i++) {
                            recipes.push(product.r);
                        }
                    }
                }
            });

            if (!hasItems) return alert("Wybierz przynajmniej jeden produkt (zmień ilość na plus)!");
            if (isNaN(price) || price < 0) return alert("Podaj prawidłową cenę za całość!");

            let customName = "Promocja: " + selectedNames.join(" + ");
            let combinedRecipe = recipes.join(', '); 
            let comboId = "combo_" + Date.now(); 

            menuData.push({ 
    n: customName,
    p: price,
    r: combinedRecipe,
    isCustom: true,
    id: comboId,
    components: selectedNames.map(x => {
        const parts = x.split('x ');
        return {
            qty: parseInt(parts[0]),
            name: parts[1]
        };
    })
});


            let posHtml = `
            <div class="custom-combo-container" id="${comboId}_pos">
                <button class="delete-combo-btn" onclick="removeCombo('${comboId}')">✖</button>
                <button class="product-btn" style="width:100%; border: 2px dashed var(--gold); background: rgba(209, 178, 111, 0.1);" onclick="addToReceipt('${customName}', ${price})">
                    <strong style="color:var(--gold); font-size:1em;">${customName}</strong>
                    <span>$${price}.00</span>
                </button>
            </div>`;
            document.getElementById('products').insertAdjacentHTML('beforeend', posHtml);

            let kitHtml = `
            <div class="recipe-card" id="${comboId}_kit" style="border-color: var(--gold); background: rgba(209, 178, 111, 0.05);">
                <h3 style="color: var(--gold); border-bottom-color: var(--gold);">${customName} <span style="color:var(--red-bright); cursor:pointer; float:right;" onclick="removeCombo('${comboId}')">✖</span></h3>
                <ul><li>${combinedRecipe || "Brak składników"}</li></ul>
            </div>`;
            document.getElementById('kitchen-recipes').insertAdjacentHTML('beforeend', kitHtml);

            let calcHtml = `
            <div class="calc-row" id="${comboId}_calc">
                <span style="color:var(--gold); font-family:'Rye'; font-size:0.9em;">${customName}</span>
                <input type="number" min="0" value="0" class="calc-input" data-name="${customName}" oninput="calculateIngredients()">
            </div>`;
            document.getElementById('calc-inputs').insertAdjacentHTML('beforeend', calcHtml);

            closeBuilder();
        };

        window.removeCombo = (id) => {
            const index = menuData.findIndex(m => m.id === id);
            if(index > -1) menuData.splice(index, 1);
            const elPos = document.getElementById(id + '_pos'); if(elPos) elPos.remove();
            const elKit = document.getElementById(id + '_kit'); if(elKit) elKit.remove();
            const elCalc = document.getElementById(id + '_calc'); if(elCalc) elCalc.remove();
            calculateIngredients();
        };
        // PROMOCJA
        // Otwieranie modala promocji
window.applyPromo = (index) => {
    const item = currentReceipt[index];
    const modal = document.getElementById('promo-modal-overlay');
    const input = document.getElementById('promo-input');
    
    document.getElementById('promo-modal-title').innerText = "Promocja: " + item.name;
    input.value = ""; // czyścimy pole
    modal.style.display = 'flex';
    input.focus();

    // Obsługa zatwierdzenia
    document.getElementById('promo-confirm-btn').onclick = () => {
        const val = input.value;
        if (val === null || val === "") {
            delete item.promoPrice;
        } else if (val.includes('%')) {
            const percent = parseFloat(val.replace('%', ''));
            if (!isNaN(percent)) item.promoPrice = item.price * (1 - (percent / 100));
        } else {
            const newPrice = parseFloat(val.replace(',', '.')); // zamiana przecinka na kropkę dla bezpieczeństwa
            if (!isNaN(newPrice)) item.promoPrice = newPrice;
        }
        closePromoModal();
        updateUI();
    };
};

// Zamykanie modala promocji
window.closePromoModal = () => {
    document.getElementById('promo-modal-overlay').style.display = 'none';
};

        function updateUI() {
            const l = document.getElementById('receipt-items'); l.innerHTML = '';
            currentTotal = 0;
            currentReceipt.forEach((i, index) => {
                const finalP = i.promoPrice || i.price;
                currentTotal += (finalP * i.quantity);
                const pText = i.promoPrice ? `<span style="text-decoration:line-through; font-size:0.8em; opacity:0.6;">$${i.price}</span> $${finalP.toFixed(2)}` : `$${i.price.toFixed(2)}`;
                l.innerHTML += `<li style="display:flex; justify-content:space-between; align-items:center;">
                    <span><span style="color:var(--gold); font-weight:bold;">${i.quantity}x</span> ${i.name} <button class="promo-btn" onclick="applyPromo(${index})">PROMO</button></span>
                    <span>${pText}</span></li>`;
            });
            document.getElementById('receipt-total').innerText = `$${currentTotal.toFixed(2)}`;
        }

        window.completeSale = async () => {
            if(!currentReceipt.length) return;
            const toSave = currentReceipt.map(i => ({...i, finalPrice: i.promoPrice || i.price}));
            const total = currentTotal; clearReceipt();
            const selectedEmployee = document.getElementById('employee-select').value;
            try {
                const now = new Date(); const id = activeSessionName + "_" + now.getTime();
                await setDoc(doc(db, "berry_lane_pos", id), { 
                    customer: selectedEmployee, items: toSave, totalPrice: total, 
                    sessionName: activeSessionName, createdAt: serverTimestamp() 
                });
            } catch(e) { console.error(e); }
        };

        // ROZLICZENIE PRACOWNIKA
        window.settleEmployee = async (name) => {
            const amountId = (name === 'Clara Lane') ? 'payout-clara' : 'payout-thomas';
            const amountVal = parseFloat(document.getElementById(amountId).innerText.replace('$', ''));
            if (amountVal <= 0) return alert("Brak kwoty do wypłaty!");
            openModal("Rozliczenie", `Czy wypłacono $${amountVal.toFixed(2)} dla ${name}?`, async () => {
                try {
                    await addDoc(collection(db, "berry_lane_payouts"), {
                        employee: name, amount: amountVal, session: activeSessionName,
                        date: new Date().toLocaleString('pl-PL'), createdAt: serverTimestamp()
                    });
                } catch (e) { console.error(e); }
            });
        };

        function listenToPayouts() {
            onSnapshot(query(collection(db, "berry_lane_payouts"), orderBy("createdAt", "desc"), limit(10)), (s) => {
                const list = document.getElementById('payout-history-list');
                list.innerHTML = s.docs.map(doc => {
                    const p = doc.data();
                    // Dodano akcję onclick, która otwiera modal i przekazuje imię oraz zmianę
                    return `<div class="history-item" style="cursor: pointer; transition: 0.2s;" onmouseover="this.style.background='rgba(209, 178, 111, 0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.05)'" onclick="showEmployeeReceipts('${p.employee}', '${p.session}')">
                        <span class="label">${p.date}</span><br>
                        <b>${p.employee}</b>: <span style="color:#aaffaa">$${p.amount.toFixed(2)}</span>
                    </div>`;
                }).join('') || '<p style="text-align:center; opacity:0.5;">Brak historii wypłat...</p>';
            });
        }

        window.archiveCurrentSession = () => {
            openModal("Zakończ Zmianę", `Rozpocząć nową sesję po ${activeSessionName}?`, async () => {
                await updateDoc(doc(db, "pos_metadata", "current_session"), { sessionNumber: increment(1) });
                location.reload();
            });
        };

        window.archiveTax = () => {
            openModal("Opłać Podatek", "Chcesz opłacić obecny podatek, wysłać go do Archiwum i zresetować Księgę na kolejne 14 dni?", async () => {
                try {
                    const taxRef = doc(db, "pos_metadata", "tax_info");
                    const snap = await getDoc(taxRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        const oldDateStr = data.nextDate || "2026-03-21";
                        const parts = oldDateStr.split('-');
                        const oldDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                        oldDateObj.setDate(oldDateObj.getDate() + 14);
                        const yyyy = oldDateObj.getFullYear();
                        const mm = String(oldDateObj.getMonth() + 1).padStart(2, '0');
                        const dd = String(oldDateObj.getDate()).padStart(2, '0');
                        const newArchiveItem = { date: oldDateStr, amount: currentTaxDue || 0, paidAt: new Date().toISOString() };
                        await updateDoc(taxRef, { nextDate: `${yyyy}-${mm}-${dd}`, archive: [...(data.archive || []), newArchiveItem] });
                        await updateDoc(doc(db, "pos_metadata", "current_session"), { globalStatsResetTime: serverTimestamp() });
                        location.reload();
                    }
                } catch(e) { console.error(e); }
            });
        };

        function listenToTaxes() {
            onSnapshot(doc(db, "pos_metadata", "tax_info"), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    const nextDateStr = data.nextDate || "2026-03-21";
                    const parts = nextDateStr.split('-');
                    const nextDateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                    const today = new Date(); today.setHours(0,0,0,0);
                    const diffDays = Math.ceil((nextDateObj - today) / (1000 * 60 * 60 * 24));
                    document.getElementById('tax-exact-date').innerText = nextDateObj.toLocaleDateString('pl-PL');
                    document.getElementById('tax-days-left').innerText = diffDays + " dni";
                    let arcHtml = '';
                    if (data.archive && data.archive.length > 0) {
                        [...data.archive].reverse().forEach(item => {
                            arcHtml += `<div class="history-item"><span class="label">Termin za:</span> ${item.date}<br><span class="label">Zapłacono:</span> <span style="color:#aaffaa">$${item.amount.toFixed(2)}</span></div>`;
                        });
                    } else arcHtml = '<p style="opacity:0.5; text-align:center;">Brak wpisów...</p>';
                    document.getElementById('tax-archive-list').innerHTML = arcHtml;
                }
            });
        }

        function startListen() {
            onSnapshot(query(collection(db, "berry_lane_pos"), orderBy("createdAt", "desc")), (s) => {
                let currentRev = 0, allTimeRev = 0, iStats = {}, allTimeItemCounts = {}, totalOrders = 0;
                let histClara = '', histThomas = '', grossClara = 0, grossThomas = 0;
                s.forEach(doc => {
                    const d = doc.data(); if(!d.createdAt) return;
                    const date = d.createdAt.toDate();
                    allTimeRev += d.totalPrice; totalOrders++;
                    if(d.items) d.items.forEach(item => {
                        if(!allTimeItemCounts[item.name]) allTimeItemCounts[item.name] = 0;
                        allTimeItemCounts[item.name] += item.quantity;
                    });
                    if (date >= statsStartTime) {
                        currentRev += d.totalPrice;
                        d.items.forEach(i => {
                            if (!iStats[i.name]) iStats[i.name] = {q: 0, r: 0};
                            iStats[i.name].q += i.quantity; iStats[i.name].r += ((i.finalPrice || i.price) * i.quantity);
                        });
                    }
                    if (d.sessionName === activeSessionName) {
                        // TWOJA STRUKTURA: SALON: KTO: DATA: WYDANO: SUMA:
                        let itemsList = '<ul style="margin:5px 0; padding-left:20px;">';
                        d.items.forEach(i => {
                            itemsList += `<li><span style="color:var(--gold); font-weight:bold;">${i.quantity}x</span> ${i.name}</li>`;
                        });
                        itemsList += '</ul>';

                        let hItem = `<div class="history-item">
                            <span class="label">Salon:</span> The Berry Lane Saloon<br>
                            <span class="label">Kto:</span> ${d.customer}<br>
                            <span class="label">Data:</span> ${date.toLocaleString()}<br>
                            <span class="label">Wydano:</span> ${itemsList}
                            <span class="label">Suma:</span> <span style="color:#aaffaa; font-weight:bold; font-size:1.1em;">$${d.totalPrice.toFixed(2)}</span>
                        </div>`;

                        if (d.customer === "Thomas Hale") { histThomas += hItem; grossThomas += d.totalPrice; }
                        else { histClara += hItem; grossClara += d.totalPrice; }
                    }
                });

                document.getElementById('payout-clara').innerText = `$${grossClara.toFixed(2)}`;
                document.getElementById('payout-thomas').innerText = `$${(grossThomas + 100).toFixed(2)}`;
                
                let bestItem = "---"; let maxQty = 0;
                Object.entries(allTimeItemCounts).forEach(([name, qty]) => { if(qty > maxQty) { maxQty = qty; bestItem = name; } });
                const cTax = currentRev * 0.1; currentTaxDue = cTax;
                document.getElementById('total-revenue').innerText = `$${currentRev.toFixed(2)}`;
                document.getElementById('list-total-sum').innerText = `$${currentRev.toFixed(2)}`;
                document.getElementById('tax-amount').innerText = `-$${cTax.toFixed(2)}`;
                document.getElementById('net-profit').innerText = `$${(currentRev - cTax).toFixed(2)}`;
                document.getElementById('at-gross').innerText = `$${allTimeRev.toFixed(2)}`;
                document.getElementById('at-tax').innerText = `-$${(allTimeRev*0.1).toFixed(2)}`;
                document.getElementById('at-net').innerText = `$${(allTimeRev*0.9).toFixed(2)}`;
                document.getElementById('all-time-net-profit').innerText = `$${(allTimeRev*0.9).toFixed(2)}`;
                if(document.getElementById('tax-current-due')) document.getElementById('tax-current-due').innerText = `$${cTax.toFixed(2)}`;
                document.getElementById('best-seller').innerText = bestItem + (maxQty > 0 ? ` (${maxQty} szt.)` : "");
                document.getElementById('customer-count').innerText = totalOrders;
                document.getElementById('history-clara').innerHTML = histClara || '<p style="text-align:center; opacity:0.5;">Brak...</p>';
                document.getElementById('history-thomas').innerHTML = histThomas || '<p style="text-align:center; opacity:0.5;">Brak...</p>';
                document.getElementById('items-sold-list').innerHTML = Object.entries(iStats).sort((a,b)=>b[1].r - a[1].r).map(([n,d])=>`<li><span>${n} (${d.q})</span><span>$${d.r.toFixed(2)}</span></li>`).join('');
            });
        }

// ==========================================================
        // === ZINTEGROWANY SYSTEM MAGAZYNU (LEWA I PRAWA KARTKA) ===
        // ==========================================================

        // --- 1. BAZY DANYCH ---
        const inventoryDocRef = doc(db, "pos_metadata", "kitchen_inventory");
        const productsDocRef = doc(db, "pos_metadata", "ready_products_inventory");
        
        window.inventoryData = {};
        window.productsData = {};

        // Emotki dla surowców
        const itemEmojis = {
            "Kukurydza": "🌽", "Jabłko": "🍎", "Ryba": "🐟", "Mleko": "🥛",
            "Marchewka": "🥕", "Woda": "💧", "Mięso": "🍖", "Wołowina": "🥩",
            "Ziemniak": "🥔", "Jajko": "🥚", "Jagoda": "🫐", "Drób": "🍗",
            "Malina": "🍓", "Pszenica": "🌾"
        };

        // --- 2. NASŁUCHIWANIE BAZY NA ŻYWO ---
        onSnapshot(inventoryDocRef, (docSnap) => {
            if (docSnap.exists()) window.inventoryData = docSnap.data();
            else setDoc(inventoryDocRef, {});
            if (window.renderInventory) window.renderInventory();
            if (window.renderProducts) window.renderProducts(); // Odświeża prawą po zmianie surowców
        });

        onSnapshot(productsDocRef, (docSnap) => {
            if (docSnap.exists()) window.productsData = docSnap.data();
            else setDoc(productsDocRef, {});
            if (window.renderProducts) window.renderProducts();
            if (window.updatePosButtonsStock) window.updatePosButtonsStock();
        });

        // --- 3. LEWA KARTKA (SUROWCE) ---
        window.renderInventory = () => {
            const list = document.getElementById('inventory-list');
            if(!list) return;
            
            let html = '';
            const sortedItems = Object.keys(window.inventoryData).sort();

            for(let item of sortedItems) {
                let emoji = itemEmojis[item] || "📦"; 
                let qty = window.inventoryData[item];
                
                html += `
                <li class="inventory-item">
                    <span style="display: flex; align-items: center; gap: 5px;">
                        <span style="font-size: 1.2em;">${emoji}</span> ${item}
                    </span>
                    <div class="inventory-controls">
                        <button class="inv-btn" onclick="updateInventory('${item}', -1)">-</button>
                        <input type="number" value="${qty}" 
                               onchange="setInventoryItem('${item}', this.value)" 
                               style="width: 45px; text-align: center; font-weight: bold; background: rgba(255,255,255,0.4); border: 1px solid rgba(92, 58, 33, 0.5); border-radius: 3px; padding: 2px; color: #241c15; outline: none; margin: 0 2px;">
                        <button class="inv-btn" onclick="updateInventory('${item}', 1)">+</button>
                        <button class="inv-btn del-btn" onclick="removeInventoryItem('${item}')">✖</button>
                    </div>
                </li>`;
            }
            if(html === '') html = '<li style="opacity:0.6; text-align:center; font-weight:normal;">Brak surowców na stanie...</li>';
            list.innerHTML = html;
        };

        window.updateInventory = async (item, amount) => {
            let currentQty = parseInt(window.inventoryData[item]) || 0;
            let newValue = currentQty + amount;
            if(newValue < 0) newValue = 0;
            await updateDoc(inventoryDocRef, { [item]: newValue });
        };
        window.setInventoryItem = async (item, newValue) => {
            let val = parseInt(newValue);
            if (isNaN(val) || val < 0) val = 0;
            await updateDoc(inventoryDocRef, { [item]: val });
        };
        window.removeInventoryItem = async (item) => {
            let newData = { ...window.inventoryData };
            delete newData[item];
            await setDoc(inventoryDocRef, newData);
        };
        window.addInventoryItem = async () => {
            const nameInput = document.getElementById('new-inv-name');
            const qtyInput = document.getElementById('new-inv-qty');
            let name = nameInput.value.trim();
            if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
            const qty = parseInt(qtyInput.value) || 0;
            if(name && qty > 0) {
                let currentQty = parseInt(window.inventoryData[name]) || 0;
                await setDoc(inventoryDocRef, { [name]: currentQty + qty }, { merge: true });
                nameInput.value = ''; qtyInput.value = '1';
            }
        };

        // --- 4. CZYTANIE PRZEPISÓW Z menuData ---
        window.parseRecipe = (recipeString) => {
            let reqs = {};
            if(!recipeString || typeof recipeString !== 'string') return reqs; 
            let parts = recipeString.split(','); 
            parts.forEach(p => {
                let splitPart = p.split('x'); 
                if (splitPart.length === 2) {
                    let qty = parseInt(splitPart[0].trim());
                    let name = splitPart[1].trim();
                    if (!isNaN(qty) && name) reqs[name] = qty;
                }
            });
            return reqs;
        };

        window.craftProduct = async (itemName) => {
            const menuItem = menuData.find(m => m.n === itemName);
            if (menuItem && menuItem.r && window.inventoryData) {
                const recipe = window.parseRecipe(menuItem.r);
                if (Object.keys(recipe).length > 0) {
                    let updates = {};
                    for (let ing in recipe) {
                        let currentQty = window.inventoryData[ing] || 0;
                        let newQty = currentQty - recipe[ing];
                        if (newQty < 0) newQty = 0;
                        updates[ing] = newQty;
                    }
                    await updateDoc(inventoryDocRef, updates);
                }
            }
            await window.updatePosProduct(itemName, 1);
        };

        // --- 5. PRAWA KARTKA (GOTOWE PRODUKTY) ---
        // --- 4. ZARZĄDZANIE PRODUKCJĄ I ZWROTAMI ---
        window.parseRecipe = (recipeString) => {
            let reqs = {};
            if(!recipeString || typeof recipeString !== 'string') return reqs; 
            let parts = recipeString.split(','); 
            parts.forEach(p => {
                let splitPart = p.split('x'); 
                if (splitPart.length === 2) {
                    let qty = parseInt(splitPart[0].trim());
                    let name = splitPart[1].trim();
                    if (!isNaN(qty) && name) reqs[name] = qty;
                }
            });
            return reqs;
        };

        // GOTOWANIE [+] (Pobiera surowce)
        window.craftProduct = async (itemName) => {
            const menuItem = menuData.find(m => m.n === itemName);
            if (menuItem && menuItem.r && window.inventoryData) {
                const recipe = window.parseRecipe(menuItem.r);
                if (Object.keys(recipe).length > 0) {
                    let updates = {};
                    for (let ing in recipe) {
                        let currentQty = window.inventoryData[ing] || 0;
                        let newQty = currentQty - recipe[ing];
                        if (newQty < 0) newQty = 0;
                        updates[ing] = newQty;
                    }
                    await updateDoc(inventoryDocRef, updates);
                }
            }
            await window.updatePosProduct(itemName, 1);
        };

        // ROZMONTOWANIE [-] (Zwraca surowce na magazyn)
        window.uncraftProduct = async (itemName) => {
            let currentProductQty = parseInt(window.productsData[itemName]) || 0;
            if (currentProductQty <= 0) return; // Nie może oddać, jeśli nic nie ma na stanie

            const menuItem = menuData.find(m => m.n === itemName);
            if (menuItem && menuItem.r && window.inventoryData) {
                const recipe = window.parseRecipe(menuItem.r);
                if (Object.keys(recipe).length > 0) {
                    let updates = {};
                    for (let ing in recipe) {
                        let currentQty = window.inventoryData[ing] || 0;
                        updates[ing] = currentQty + recipe[ing]; // Oddaje surowce na stan
                    }
                    await updateDoc(inventoryDocRef, updates);
                }
            }
            // Zabiera z prawej kartki
            await window.updatePosProduct(itemName, -1); 
        };

        // RĘCZNA EDYCJA (Rozpoznaje czy wpisałeś więcej czy mniej i oddaje/pobiera resztę)
        window.manualSetProduct = async (itemName, newValue) => {
            let val = parseInt(newValue);
            if (isNaN(val) || val < 0) val = 0;
            
            let currentQty = parseInt(window.productsData[itemName]) || 0;
            let diff = val - currentQty; 
            
            if (diff === 0) return; // Nic się nie zmieniło

            const menuItem = menuData.find(m => m.n === itemName);
            
            if (menuItem && menuItem.r && window.inventoryData) {
                const recipe = window.parseRecipe(menuItem.r);
                if (Object.keys(recipe).length > 0) {
                    
                    // Jeśli wpisuje WIĘCEJ - sprawdzamy, czy w ogóle starczy surowców na tyle porcji
                    if (diff > 0) {
                        let canCraft = true;
                        let missing = [];
                        for (let ing in recipe) {
                            let currentIngQty = window.inventoryData[ing] || 0;
                            let required = recipe[ing] * diff;
                            if (currentIngQty < required) {
                                canCraft = false;
                                missing.push(`${ing} (${currentIngQty}/${required})`);
                            }
                        }
                        if (!canCraft) {
                            showCustomAlert(`Brak surowców na dorobienie <strong>${diff} szt.</strong><br>Brakuje:<br> <span style="color:var(--red-bright);">${missing.join('<br>')}</span>`);
                            if (window.renderProducts) window.renderProducts(); // Cofa błędną liczbę z okienka
                            return;
                        }
                    }

                    // Obliczamy nowe stany surowców i wysyłamy do Firebase
                    let updates = {};
                    for (let ing in recipe) {
                        let currentIngQty = window.inventoryData[ing] || 0;
                        updates[ing] = currentIngQty - (recipe[ing] * diff);
                    }
                    await updateDoc(inventoryDocRef, updates);
                }
            }

            // Na koniec zmieniamy ostateczną ilość potraw na prawej kartce
            await window.setPosProduct(itemName, val);
        };

        // --- 5. PRAWA KARTKA (GOTOWE PRODUKTY) ---
        window.renderProducts = () => {
            const list = document.getElementById('products-list');
            if(!list) return;
            
            let html = '';
            menuData.forEach(item => {
                let itemName = item.n; 
                let qty = window.productsData[itemName] || 0; 
                
                let canCraft = true;
                let missingIng = [];
                let recipe = window.parseRecipe(item.r); 
                
                if (Object.keys(recipe).length > 0 && window.inventoryData) {
                    for (let ing in recipe) {
                        let currentStock = window.inventoryData[ing] || 0;
                        if (currentStock < recipe[ing]) {
                            canCraft = false;
                            missingIng.push(`${ing} (${currentStock}/${recipe[ing]})`);
                        }
                    }
                } else if (Object.keys(recipe).length > 0 && (!window.inventoryData || Object.keys(window.inventoryData).length === 0)) {
                    canCraft = false;
                    missingIng.push("Brak surowców w magazynie");
                }

                let rowStyle = canCraft ? "" : "background: rgba(163, 38, 32, 0.15); border-left: 3px solid var(--red-bright); padding-left: 5px; opacity: 0.9;";
                let plusBtnStyle = canCraft ? "" : "background-color: gray; color: #ccc; cursor: not-allowed; transform: none;";
                
                let alertMsg = `Brak surowców! Brakuje:<br><span style='color:var(--red-bright);'>- ${missingIng.join('<br>- ')}</span>`;
                let btnAction = canCraft 
                    ? `onclick="craftProduct('${itemName}')"` 
                    : `onclick="showCustomAlert('${alertMsg}')"`;

                if (Object.keys(recipe).length === 0) {
                    btnAction = `onclick="updatePosProduct('${itemName}', 1)"`;
                }
                
                html += `
                <li class="inventory-item" style="${rowStyle}">
                    <span>🍹 ${itemName}</span>
                    <div class="inventory-controls">
                        <button class="inv-btn" onclick="uncraftProduct('${itemName}')">-</button>
                        
                        <input type="number" value="${qty}" 
                               onchange="manualSetProduct('${itemName}', this.value)" 
                               style="width: 45px; text-align: center; font-weight: bold; background: rgba(255,255,255,0.4); border: 1px solid rgba(92, 58, 33, 0.5); border-radius: 3px; padding: 2px; color: #241c15; outline: none; margin: 0 2px;">
                               
                        <button class="inv-btn" style="${plusBtnStyle}" ${btnAction}>+</button>
                    </div>
                </li>`;
            });

            list.innerHTML = html;
        };

        window.updatePosProduct = async (item, amount) => {
            let currentQty = parseInt(window.productsData[item]) || 0;
            let newValue = currentQty + amount;
            if(newValue < 0) newValue = 0;
            await updateDoc(productsDocRef, { [item]: newValue });
        };
        window.setPosProduct = async (item, newValue) => {
            let val = parseInt(newValue);
            if (isNaN(val) || val < 0) val = 0;
            await updateDoc(productsDocRef, { [item]: val });
        };

        window.updatePosButtonsStock = () => {
            const productButtons = document.querySelectorAll('.product-btn');
            productButtons.forEach(btn => {
                const strongTag = btn.querySelector('strong');
                if (!strongTag) return; 
                
                const itemName = strongTag.innerText.trim(); 
                if (window.productsData[itemName] !== undefined) {
                    let stockBadge = btn.querySelector('.stock-badge');
                    if (!stockBadge) {
                        stockBadge = document.createElement('span');
                        stockBadge.className = 'stock-badge';
                        btn.appendChild(stockBadge);
                    }
                    const stock = window.productsData[itemName];
                    stockBadge.innerText = `📦 ${stock} szt.`;
                    
                    if (stock <= 0) btn.style.opacity = '0.4';
                    else btn.style.opacity = '1';
                } else {
                    let stockBadge = btn.querySelector('.stock-badge');
                    if (stockBadge) {
                        stockBadge.remove();
                        btn.style.opacity = '1'; 
                    }
                }
            });
        };
        // --- WŁASNE OKIENKA ALERTÓW ---
        window.showCustomAlert = (message) => {
            document.getElementById('customAlertMsg').innerHTML = message;
            document.getElementById('customAlertOverlay').style.display = 'flex';
        };
        window.closeCustomAlert = () => {
            document.getElementById('customAlertOverlay').style.display = 'none';
        };

        // --- WYŚWIETLANIE SZCZEGÓŁÓW ROZLICZENIA NA DUŻEJ KARTCE ---
        window.showEmployeeReceipts = async (employee, session) => {
            const modalOverlay = document.getElementById('receipts-modal-overlay');
            const contentDiv = document.getElementById('receipts-modal-content');
            
            document.getElementById('receipts-modal-title').innerText = `Rozliczenie: ${employee}`;
            contentDiv.innerHTML = '<p style="text-align:center; font-family:\'Rye\'; font-size:1.2em; padding: 20px;">Odkurzam księgi i szukam paragonów...</p>';
            modalOverlay.style.display = 'flex';

            try {
                // Szukamy paragonów, gdzie zgadza się nazwa zmiany (session) oraz kasjer (employee)
                const q = query(collection(db, "berry_lane_pos"), where("sessionName", "==", session), where("customer", "==", employee));
                const snapshot = await getDocs(q);
                
                if (snapshot.empty) {
                    contentDiv.innerHTML = '<p style="text-align:center; padding: 20px;">Brak paragonów dla tej osoby podczas wskazanej zmiany.</p>';
                    return;
                }

                let html = '';
                let totalSum = 0;

                // Segregujemy paragony od najnowszego do najstarszego
                const receipts = [];
                snapshot.forEach(doc => receipts.push(doc.data()));
                receipts.sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());

                receipts.forEach(data => {
                    const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleTimeString('pl-PL') : 'Brak czasu';
                    totalSum += data.totalPrice || 0;
                    
                    html += `<div style="border: 2px dashed #8c7355; padding: 10px; margin-bottom: 15px; border-radius: 5px; background: rgba(0,0,0,0.03);">
                        <div style="border-bottom: 1px solid #8c7355; padding-bottom: 5px; margin-bottom: 10px; font-family: 'Rye'; font-size: 1.1em; display: flex; justify-content: space-between;">
                            <span>⏱️ ${dateStr}</span>
                            <span style="color: var(--green-bright); font-weight: bold;">$${(data.totalPrice || 0).toFixed(2)}</span>
                        </div>
                        <ul style="list-style: none; padding: 0; margin: 0; font-size: 0.95em; color: #4a3625;">`;
                    
                    (data.items || []).forEach(item => {
                        html += `<li style="display:flex; justify-content:space-between; margin-bottom: 4px; border-bottom: 1px dotted rgba(0,0,0,0.1);">
                            <span><b>${item.quantity}x</b> ${item.name}</span>
                            <span>$${(item.finalPrice * item.quantity).toFixed(2)}</span>
                        </li>`;
                    });
                    
                    html += `</ul></div>`;
                });

                // Nagłówek z zsumowanym utargiem dla tego pracownika
                html = `<div style="text-align:center; font-family:'Rye'; font-size:1.3em; color:var(--red-bright); margin-bottom:20px; border-bottom:3px double #8c7355; padding-bottom:10px;">
                    Wypracowany utarg (Brutto): $${totalSum.toFixed(2)}
                </div>` + html;

                contentDiv.innerHTML = html;

            } catch (e) {
                console.error(e);
                contentDiv.innerHTML = '<p style="text-align:center; color:red; font-weight:bold;">Wystąpił błąd podczas czytania ksiąg.</p>';
            }
        };

        
        // Zamykanie kartki
        window.closeReceiptsModal = () => {
            document.getElementById('receipts-modal-overlay').style.display = 'none';
        };

// =========================================================
// ZAKŁADKA SKUPU TOWARU
// =========================================================

const skupData = [
    { name: 'Pszenica', price: 0.5 },
    { name: 'Jabłko', price: 0.6 },
    { name: 'Marchew', price: 0.5 },
    { name: 'Jajka', price: 0.6 },
    { name: 'Mleko', price: 1.0 },
    { name: 'Jagody', price: 0.3 },
    { name: 'Ziemniak', price: 0.5 },
    { name: 'Kukurydza', price: 0.5 },
    { name: 'Czerwona Malina', price: 0.5 },
    { name: 'Mięso Drobiowe', price: 0.7 },
    { name: 'Mięso', price: 0.6 },
    { name: 'Wołowina', price: 1.0 },
    { name: 'Ryba', price: 1.0 },
    { name: 'Woda', price: 0.55 },
];

let skupCart = {};

// Generowanie kafelków towarów (TERAZ JAKO WINDOW)
window.renderSkupGrid = () => {
    const grid = document.getElementById('skup-grid');
    if(!grid) return;
    
    grid.innerHTML = skupData.map(item => `
        <div class="menu-item" style="cursor: pointer; background: var(--wood-medium); padding: 15px; border: 2px solid #634b35; border-radius: 5px; text-align: center;" 
             onclick="window.addSkupItem('${item.name}', ${item.price})">
            <strong style="font-size:1.2em; color: var(--parchment); display:block;">${item.name}</strong>
            <span style="color:var(--green-bright); font-weight:bold;">$${item.price.toFixed(2)}</span>
        </div>
    `).join('');
};
// Funkcja dodawania do listy
window.addSkupItem = (name, price) => {
    const modal = document.getElementById('skup-modal-overlay');
    const text = document.getElementById('skup-modal-text');
    const input = document.getElementById('skup-qty-input');
    const confirmBtn = document.getElementById('skup-confirm-btn');

    text.innerText = `Ile sztuk [ ${name} ] kupujesz od dostawcy?`;
    input.value = 1;

    modal.style.display = 'flex';

    confirmBtn.onclick = () => {
        const qty = parseInt(input.value);

        if (isNaN(qty) || qty <= 0) {
            window.showCustomAlert("Podano nieprawidłową ilość!");
            return;
        }

        if (skupCart[name]) {
            skupCart[name].qty += qty;
        } else {
            skupCart[name] = { price: price, qty: qty };
        }

        window.updateSkupUI();
        closeSkupModal();
    };
};
window.closeSkupModal = () => {
    document.getElementById('skup-modal-overlay').style.display = 'none';
};

// Odświeżanie rachunku skupu
// Odświeżanie rachunku skupu (teraz z guzikiem usuwania)
// Odświeżanie rachunku skupu (z plusami, minusami i przyciskiem usuwania X)
window.updateSkupUI = () => {
    const list = document.getElementById('skup-list');
    const totalSpan = document.getElementById('skup-total');
    let total = 0;
    let html = '';

    for (let [name, data] of Object.entries(skupCart)) {
        const sum = data.price * data.qty;
        total += sum;
        
        html += `<li style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:1px dotted rgba(255,255,255,0.2); padding-bottom: 8px;">
            
            <div style="flex: 1; display:flex; align-items:center; gap: 10px;">
                <div style="display:flex; gap: 3px;">
                    <button onclick="window.decreaseSkupItem('${name}')" style="background:#555; color:white; border:1px solid #960606; border-radius:3px; cursor:pointer; padding:2px 8px; font-weight:bold;">-</button>
                    <span style="background: rgba(0,0,0,0.3); padding: 2px 8px; min-width: 20px; text-align: center; border-radius: 3px;"><b>${data.qty}</b></span>
                    <button onclick="window.increaseSkupItem('${name}')" style="background:#555; color:white; border:1px solid #016d25; border-radius:3px; cursor:pointer; padding:2px 8px; font-weight:bold;">+</button>
                </div>
                <span>${name}</span>
            </div>

            <div style="display:flex; align-items:center; gap: 15px;">
                <span style="color:#aaffaa; font-weight:bold;">$${sum.toFixed(2)}</span>
                <button onclick="window.removeSkupItem('${name}')" style="background: var(--red-bright); color: white; border: 1px solid #000; border-radius: 3px; padding: 2px 10px; cursor: pointer; font-weight: bold; box-shadow: 2px 2px 0px #000;">X</button>
            </div>

        </li>`;
    }

    list.innerHTML = html || '<li style="opacity:0.5;">Wybierz towar z listy po lewej...</li>';
    totalSpan.innerText = total.toFixed(2);
};

// Funkcja całkowitego usuwania przedmiotu ze skupu
window.removeSkupItem = (name) => {
    delete skupCart[name];
    window.updateSkupUI();
};
window.showConfirmModal = (title, message, onConfirm) => {
    const overlay = document.getElementById('modal-overlay');
    const titleEl = document.getElementById('modal-title');
    const msgEl = document.getElementById('modal-message');
    const confirmBtn = document.getElementById('modal-confirm-btn');

    titleEl.innerText = title;
    msgEl.innerText = message;

    overlay.style.display = 'flex';

    confirmBtn.onclick = () => {
        overlay.style.display = 'none';
        onConfirm();
    };
};

window.increaseSkupItem = (name) => {
    skupCart[name].qty += 1;
    window.updateSkupUI();
};

window.decreaseSkupItem = (name) => {
    skupCart[name].qty -= 1;

    if (skupCart[name].qty <= 0) {
        delete skupCart[name];
    }

    window.updateSkupUI();
};

window.removeSkupItem = (name) => {
    showConfirmModal(
        "Usuń produkt",
        `Czy chcesz usunąć ${name} z listy skupu?`,
        () => {
            delete skupCart[name];
            window.updateSkupUI();
        }
    );
};
// =========================================================
// BAZA DANYCH & HISTORIA DLA SKUPU
// =========================================================

const skupHistoryCol = collection(db, "berry_lane_skup_history");

// Funkcja 1: Zapisywanie Skupu do Firebase
// Funkcja 1: Zapisywanie Skupu do Firebase (Z KLIMATYCZNYM ALERTEM)
// Funkcja 1: Zapisywanie Skupu do Firebase (Z Imieniem Pracownika)
window.saveSkupPurchase = async () => {
    const total = parseFloat(document.getElementById('skup-total').innerText);
    
    if (total <= 0 || Object.keys(skupCart).length === 0) {
        window.showCustomAlert("Księga skupu jest pusta. Dodaj towary przed zapisem!");
        return;
    }

    // Pobieramy imię pracownika z głównej zakładki POS
    const currentEmployee = document.getElementById('employee-select').value;

    window.showConfirmModal(
        "Zatwierdzenie Skupu",
        `Czy na pewno chcesz zatwierdzić skup na kwotę $${total.toFixed(2)}?\nTowar przyjmuje: ${currentEmployee}.`,
        async () => {
            try {
                const purchaseData = {
                    items: skupCart,
                    totalPrice: total,
                    createdAt: serverTimestamp(),
                    sessionName: document.getElementById('session-display').innerText.replace('Bieżąca zmiana: ', ''),
                    employeeName: currentEmployee // Dodajemy pracownika do bazy!
                };

                await addDoc(skupHistoryCol, purchaseData);

                skupCart = {};
                window.updateSkupUI();
                window.showCustomAlert(`Skup zapisany w Księdze Towaru przez: ${currentEmployee}. Do wypłaty: $${total.toFixed(2)}`);

            } catch (e) {
                console.error("Błąd zapisu skupu:", e);
                window.showCustomAlert("Nie udało się zapisać skupu. Sprawdź połączenie.");
            }
        }
    );
};

// Funkcja 2: Wyświetlanie Historii (Z Imieniem Pracownika)
window.showSkupHistory = async () => {
    const modal = document.getElementById('skup-history-modal-overlay');
    const content = document.getElementById('skup-history-modal-content');
    
    modal.style.display = 'flex';
    content.innerHTML = '<p style="text-align:center; font-family:\'Rye\'; font-size:1.2em;">Odkurzam stare księgi skupu...</p>';

    try {
        const q = query(skupHistoryCol, orderBy("createdAt", "desc"), limit(30));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            content.innerHTML = '<p style="text-align:center; opacity:0.6; padding:20px;">Księga skupu jest na razie pusta.</p>';
            return;
        }

        let html = '';
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            const docId = docSnap.id; 
            const dateStr = data.createdAt ? data.createdAt.toDate().toLocaleString('pl-PL') : 'Brak daty';
            
            html += `<div style="border: 2px dashed #8c7355; padding: 15px; margin-bottom: 20px; border-radius: 5px; background: rgba(0,0,0,0.03); position: relative;">
                
                <button onclick="window.deleteSkupHistoryItem('${docId}')" style="position: absolute; top: 10px; right: 10px; background: var(--red-bright); color: white; border: 1px solid #000; border-radius: 3px; cursor: pointer; font-weight: bold; padding: 5px 10px; box-shadow: 2px 2px 0px #000;">X USUŃ WPIS</button>
                
                <div style="border-bottom: 1px dotted #8c7355; padding-bottom: 8px; margin-bottom: 10px; font-family: 'Rye'; font-size: 1.1em; display: flex; flex-direction: column; color: var(--wood-dark); padding-right: 100px;">
                    <span>📅 ${dateStr}</span>
                    <span style="color: var(--green-bright); font-weight: bold; margin-top: 5px;">Suma: $${(data.totalPrice || 0).toFixed(2)}</span>
                </div>
                
                <div style="font-size:0.95em; color:#444; margin-bottom:10px; font-weight: bold;">
                    👤 Przyjął/ęła: <span style="color:var(--red-bright);">${data.employeeName || 'Nieznany pracownik'}</span>
                </div>
                <div style="font-size:0.85em; color:#888; margin-bottom:10px; font-style: italic;">
                    Zmiana: ${data.sessionName || 'Nieznana'}
                </div>

                <ul style="list-style: none; padding: 0; margin: 0; color: #4a3625; font-size: 0.95em;">`;

            Object.entries(data.items || {}).forEach(([name, details]) => {
                html += `<li style="display:flex; justify-content:space-between; margin-bottom: 4px; border-bottom: 1px dotted rgba(0,0,0,0.1);">
                    <span><b>${details.qty}x</b> ${name}</span>
                    <span>$${(details.price * details.qty).toFixed(2)}</span>
                </li>`;
            });

            html += `</ul></div>`;
        });

        content.innerHTML = html;

    } catch (e) {
        console.error("Błąd pobierania historii:", e);
        content.innerHTML = '<p style="text-align:center; color:red; font-weight:bold;">Wystąpił błąd przy czytaniu ksiąg...</p>';
    }
};

// NOWA FUNKCJA: Usuwanie wpisu z bazy danych Firebase
window.deleteSkupHistoryItem = (docId) => {
    window.showConfirmModal(
        "Spalenie wpisu",
        "Czy na pewno chcesz wyrwać tę kartę z Księgi Skupu? Ta akcja jest nieodwracalna!",
        async () => {
            try {
                // Usuwa dokument o konkretnym ID z bazy Firebase
                await deleteDoc(doc(db, "berry_lane_skup_history", docId));
                window.showCustomAlert("Wpis został wymazany z historii.");
                window.showSkupHistory(); // Od razu odświeża księgę, żeby wpis zniknął z ekranu
            } catch (e) {
                console.error("Błąd usuwania wpisu: ", e);
                window.showCustomAlert("Nie udało się usunąć wpisu. Sprawdź połączenie.");
            }
        }
    );
};

// Funkcja 3: Zamykanie Historii
window.closeSkupHistoryModal = () => {
    document.getElementById('skup-history-modal-overlay').style.display = 'none';
};
// ==========================================
// NAPRAWA: FUNKCJE KALKULATORA KUCHNI
// ==========================================

window.increaseCalcQty = (index) => {
    const input = document.getElementById(`calc-qty-${index}`);
    if (input) {
        input.value = parseInt(input.value) + 1;
        window.calculateIngredients();
    }
};

window.decreaseCalcQty = (index) => {
    const input = document.getElementById(`calc-qty-${index}`);
    if (input && parseInt(input.value) > 1) {
        input.value = parseInt(input.value) - 1;
        window.calculateIngredients();
    }
};

