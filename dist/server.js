// server/server.ts
var QBCore = global.exports["qb-core"].GetCoreObject();
var oxmysql = global.exports["oxmysql"];
function getPlayer(src) {
  return QBCore.Functions.GetPlayer(src);
}
function allOnlinePlayers() {
  return QBCore.Functions.GetQBPlayers();
}
function playerByPhone(phone) {
  const players = allOnlinePlayers();
  for (const id in players) {
    const p = players[id];
    if (p?.PlayerData?.charinfo?.phone === phone)
      return p;
  }
  return null;
}
function fullName(p) {
  const { firstname, lastname } = p.PlayerData.charinfo;
  return `${firstname} ${lastname}`;
}
QBCore.Functions.CreateCallback(
  "bankingapp:getBalance",
  (src, cb) => {
    const player = getPlayer(src);
    if (!player)
      return cb({ ok: false, error: "Player not found" });
    cb({
      ok: true,
      data: {
        bank: player.PlayerData.money.bank,
        cash: player.PlayerData.money.cash,
        citizenid: player.PlayerData.citizenid
      }
    });
  }
);
QBCore.Functions.CreateCallback(
  "bankingapp:getTransactions",
  (src, cb) => {
    const player = getPlayer(src);
    if (!player)
      return cb({ ok: false, error: "Player not found" });
    const citizenid = player.PlayerData.citizenid;
    oxmysql.execute(
      "SELECT transactions FROM player_transactions WHERE id = ?",
      [citizenid],
      (rows) => {
        if (!rows || rows.length === 0)
          return cb({ ok: true, data: [] });
        const raw = rows[0].transactions;
        if (!raw)
          return cb({ ok: true, data: [] });
        let entries;
        try {
          entries = JSON.parse(raw);
        } catch {
          return cb({ ok: true, data: [] });
        }
        if (!Array.isArray(entries))
          return cb({ ok: true, data: [] });
        const txs = entries.slice(0, 50).map((entry, i) => {
          const rawType = (entry.trans_type ?? "").toLowerCase();
          const hasOtherParty = entry.issuer && entry.receiver && entry.issuer !== entry.receiver;
          let type;
          let other_party = null;
          if (rawType === "withdraw") {
            if (hasOtherParty) {
              type = "transfer_out";
              other_party = entry.receiver ?? null;
            } else {
              type = "withdrawal";
            }
          } else if (rawType === "deposit") {
            if (hasOtherParty) {
              type = "transfer_in";
              other_party = entry.issuer ?? null;
            } else {
              type = "deposit";
            }
          } else {
            type = "deposit";
          }
          return {
            id: i + 1,
            type,
            amount: Math.abs(entry.amount ?? 0),
            description: entry.message || entry.title || type,
            other_party,
            timestamp: new Date((entry.time ?? 0) * 1e3).toISOString()
          };
        });
        cb({ ok: true, data: txs });
      }
    );
  }
);
QBCore.Functions.CreateCallback(
  "bankingapp:getPlayerByPhone",
  (src, cb, phoneNumber) => {
    const recipient = playerByPhone(phoneNumber);
    if (!recipient)
      return cb({ ok: false, error: "No online player with that phone number" });
    cb({ ok: true, data: { name: fullName(recipient) } });
  }
);
QBCore.Functions.CreateCallback(
  "bankingapp:transfer",
  (src, cb, payload) => {
    const sender = getPlayer(src);
    if (!sender)
      return cb({ ok: false, error: "Player not found" });
    const sanitized = Math.floor(payload.amount);
    if (sanitized <= 0)
      return cb({ ok: false, error: "Amount must be greater than 0" });
    if (sender.PlayerData.money.bank < sanitized)
      return cb({ ok: false, error: "Insufficient bank balance" });
    const recipient = playerByPhone(payload.phoneNumber);
    if (!recipient)
      return cb({ ok: false, error: "Recipient not found or offline" });
    if (recipient.PlayerData.citizenid === sender.PlayerData.citizenid)
      return cb({ ok: false, error: "Cannot transfer to yourself" });
    const senderName = fullName(sender);
    const recipientName = fullName(recipient);
    sender.Functions.RemoveMoney("bank", sanitized, "bankingapp-transfer-out");
    recipient.Functions.AddMoney("bank", sanitized, "bankingapp-transfer-in");
    emitNet("bankingapp:client:incomingTransfer", recipient.PlayerData.source, { amount: sanitized, from: senderName });
    cb({ ok: true, data: { bank: sender.PlayerData.money.bank, cash: sender.PlayerData.money.cash } });
    const renewedBanking = global.exports["Renewed-Banking"];
    renewedBanking.handleTransaction(
      sender.PlayerData.citizenid,
      `Personal Account`,
      sanitized,
      `Transfer to ${recipientName}`,
      senderName,
      recipientName,
      "withdraw"
    );
    renewedBanking.handleTransaction(
      recipient.PlayerData.citizenid,
      `Personal Account`,
      sanitized,
      `Transfer from ${senderName}`,
      senderName,
      recipientName,
      "deposit"
    );
  }
);
QBCore.Functions.CreateCallback(
  "bankingapp:deposit",
  (src, cb, amount) => {
    const player = getPlayer(src);
    if (!player)
      return cb({ ok: false, error: "Player not found" });
    const sanitized = Math.floor(amount);
    if (sanitized <= 0)
      return cb({ ok: false, error: "Amount must be greater than 0" });
    if (player.PlayerData.money.cash < sanitized)
      return cb({ ok: false, error: "Insufficient cash" });
    player.Functions.RemoveMoney("cash", sanitized, "bankingapp-deposit");
    player.Functions.AddMoney("bank", sanitized, "bankingapp-deposit");
    cb({ ok: true, data: { bank: player.PlayerData.money.bank, cash: player.PlayerData.money.cash } });
  }
);
QBCore.Functions.CreateCallback(
  "bankingapp:withdraw",
  (src, cb, amount) => {
    const player = getPlayer(src);
    if (!player)
      return cb({ ok: false, error: "Player not found" });
    const sanitized = Math.floor(amount);
    if (sanitized <= 0)
      return cb({ ok: false, error: "Amount must be greater than 0" });
    if (player.PlayerData.money.bank < sanitized)
      return cb({ ok: false, error: "Insufficient bank balance" });
    player.Functions.RemoveMoney("bank", sanitized, "bankingapp-withdraw");
    player.Functions.AddMoney("cash", sanitized, "bankingapp-withdraw");
    cb({ ok: true, data: { bank: player.PlayerData.money.bank, cash: player.PlayerData.money.cash } });
  }
);
//# sourceMappingURL=server.js.map
