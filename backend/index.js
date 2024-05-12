const app = require("express")();
const http = require("http").Server(app);
const io = require("socket.io")(http);
var uniqid = require("uniqid");
const GameService = require("./services/game.services");

// ---------------------------------------------------
// -------- CONSTANTS AND GLOBAL VARIABLES -----------
// ---------------------------------------------------

let queue = [];
let games = [];

// ---------------------------------
// -------- GAME METHODS -----------
// ---------------------------------

const updateClientsViewTimers = (game) => {
  game.player1Socket.emit(
    "game.timer",
    GameService.send.forPlayer.gameTimer("player:1", game.gameState)
  );
  game.player2Socket.emit(
    "game.timer",
    GameService.send.forPlayer.gameTimer("player:2", game.gameState)
  );
};

const updateClientsViewDecks = (game) => {
  setTimeout(() => {
    game.player1Socket.emit(
      "game.deck.view-state",
      GameService.send.forPlayer.deckViewState("player:1", game.gameState)
    );
    game.player2Socket.emit(
      "game.deck.view-state",
      GameService.send.forPlayer.deckViewState("player:2", game.gameState)
    );
  }, 200);
};

const updateClientsViewChoices = (game) => {
  game.player1Socket.emit(
    "game.choices.view-state",
    GameService.send.forPlayer.choicesViewState("player:1", game.gameState)
  );
  game.player2Socket.emit(
    "game.choices.view-state",
    GameService.send.forPlayer.choicesViewState("player:2", game.gameState)
  );
};

const updateClientsViewGrid = (game) => {
  setTimeout(() => {
    game.player1Socket.emit(
      "game.grid.view-state",
      GameService.send.forPlayer.gridViewState("player:1", game)
    );
    game.player2Socket.emit(
      "game.grid.view-state",
      GameService.send.forPlayer.gridViewState("player:2", game)
    );
  }, 200);
};

const updateClientsViewPlayersInfos = (game) => {
  setTimeout(() => {
    game.player1Socket.emit(
      "game.players-infos.view-state",
      GameService.send.forPlayer.playerAndOppnonentInfosState(
        "player:1",
        game.gameState
      )
    );
    game.player2Socket.emit(
      "game.players-infos.view-state",
      GameService.send.forPlayer.playerAndOppnonentInfosState(
        "player:2",
        game.gameState
      )
    );
  }, 200);
};

const newPlayerInQueue = (socket) => {
  queue.push(socket);

  // Queue management
  if (queue.length >= 2) {
    const player1Socket = queue.shift();
    const player2Socket = queue.shift();
    createGame(player1Socket, player2Socket, "online");
  } else {
    socket.emit("queue.added", GameService.send.forPlayer.viewQueueState());
  }
};

const createGame = (player1Socket, player2Socket, type) => {
  // init objet (game) with this first level of structure:
  // - gameState : { .. evolutive object .. }
  // - idGame : just in case ;)
  // - player1Socket: socket instance key "joueur:1"
  // - player2Socket: socket instance key "joueur:2"
  const newGame = GameService.init.gameState();
  newGame["idGame"] = uniqid();
  newGame["gameState"]["gameType"] = type;
  newGame["gameState"]["gameStartTime"] = Date.now();
  newGame["gameState"]["gameEndTime"] = null;
  newGame["player1Socket"] = player1Socket;
  newGame["player2Socket"] = player2Socket;

  // push game into 'games' global array
  games.push(newGame);

  const gameIndex = GameService.utils.findGameIndexById(games, newGame.idGame);

  // just notifying screens that game is starting
  games[gameIndex].player1Socket.emit(
    "game.start",
    GameService.send.forPlayer.gameViewState("player:1", games[gameIndex])
  );
  games[gameIndex].player2Socket.emit(
    "game.start",
    GameService.send.forPlayer.gameViewState("player:2", games[gameIndex])
  );

  updateClientsViewTimers(games[gameIndex]);
  updateClientsViewDecks(games[gameIndex]);
  updateClientsViewGrid(games[gameIndex]);
  updateClientsViewPlayersInfos(games[gameIndex]);

  // timer every second
  games[gameIndex].gameInterval = setInterval(() => {
    // timer variable decreased
    games[gameIndex].gameState.timer--;

    // emit timer to both clients every seconds
    updateClientsViewTimers(games[gameIndex]);

    // if timer is down to 0, we end turn
    if (games[gameIndex].gameState.timer === 0) {
      // switch currentTurn variable
      games[gameIndex].gameState.currentTurn =
        games[gameIndex].gameState.currentTurn === "player:1"
          ? "player:2"
          : "player:1";
      // reset timer
      games[gameIndex].gameState.timer = GameService.timer.getTurnDuration();

      // reset deck state
      games[gameIndex].gameState.deck = GameService.init.deck();

      // reset choices state
      games[gameIndex].gameState.choices = GameService.init.choices();

      // reset views also
      updateClientsViewTimers(games[gameIndex]);
      updateClientsViewDecks(games[gameIndex]);
      updateClientsViewChoices(games[gameIndex]);
      updateClientsViewGrid(games[gameIndex]);
    }
  }, 1000);

  // remove intervals at deconnection
  player1Socket.on("disconnect", () => {
    clearInterval(games[gameIndex].gameInterval);
  });

  player2Socket.on("disconnect", () => {
    clearInterval(games[gameIndex].gameInterval);
  });
};
const leaveQueue = (socket) => {
  const index = queue.indexOf(socket);
  if (index > -1) {
    queue.splice(index, 1);
  }

  socket.emit("queue.removed", GameService.send.forPlayer.viewQueueState());
};

// ---------------------------------------
// -------- SOCKETS MANAGEMENT -----------
// ---------------------------------------

io.on("connection", (socket) => {
  console.log(`[${socket.id}] socket connected`);

  socket.on("queue.join", () => {
    console.log(`[${socket.id}] new player in queue `);
    newPlayerInQueue(socket);
  });

  socket.on("queue.leave", () => {
    console.log(`[${socket.id}] player leave the queue`);
    leaveQueue(socket);
  });

  socket.on("game.dices.roll", () => {
    const gameIndex = GameService.utils.findGameIndexBySocketId(
      games,
      socket.id
    );
    // If not last throw : rollsCounter(1,2,3) <= rollsMaximum(3)
    if (
      games[gameIndex].gameState.deck.rollsCounter <=
      games[gameIndex].gameState.deck.rollsMaximum -1
    ) {
      // Dices management
      games[gameIndex].gameState.deck.dices = GameService.dices.roll(
        games[gameIndex].gameState.deck.dices
      );
      games[gameIndex].gameState.deck.rollsCounter++;

      const dices = games[gameIndex].gameState.deck.dices;
      const isDefi = false;
      const isFirstRoll = games[gameIndex].gameState.deck.rollsCounter === 1;

      const combinations = GameService.choices.findCombinations(
        dices,
        isDefi,
        isFirstRoll
      );

      games[gameIndex].gameState.choices.availableChoices = combinations;
    }
    // If last throw
    else {
      // Dices management
      games[gameIndex].gameState.deck.dices = GameService.dices.roll(
        games[gameIndex].gameState.deck.dices
      );
      games[gameIndex].gameState.deck.rollsCounter++;

      games[gameIndex].gameState.deck.dices = GameService.dices.lockEveryDice(
        games[gameIndex].gameState.deck.dices
      );

      const dices = games[gameIndex].gameState.deck.dices;
      const isDefi = false;
      const isFirstRoll = games[gameIndex].gameState.deck.rollsCounter === 1;

      const combinations = GameService.choices.findCombinations(
        dices,
        isDefi,
        isFirstRoll
      );

      games[gameIndex].gameState.choices.availableChoices = combinations;

      if (combinations.length == 0) {
        games[gameIndex].gameState.timer = 3;
      }
    }

    if (games[gameIndex].gameState.choices.availableChoices.length > 0) {
      const updatedAvailableChoices = GameService.choices.filterChoicesEnabler(
        games[gameIndex].gameState.grid,
        games[gameIndex].gameState.choices.availableChoices
      );

      games[gameIndex].gameState.choices.availableChoices =
        updatedAvailableChoices;
    }

    // Dice Animation
    setTimeout(() => {
      updateClientsViewDecks(games[gameIndex]);
      updateClientsViewChoices(games[gameIndex]);
    }, 0);
  });

  socket.on("game.dices.lock", (idDice) => {
    const gameIndex = GameService.utils.findGameIndexBySocketId(
      games,
      socket.id
    );
    const diceIndex = GameService.utils.findDiceIndexByDiceId(
      games[gameIndex].gameState.deck.dices,
      idDice
    );

    games[gameIndex].gameState.deck.dices[diceIndex].locked =
      !games[gameIndex].gameState.deck.dices[diceIndex].locked;

    updateClientsViewDecks(games[gameIndex]);
  });

  socket.on("game.choices.selected", (data) => {
    // gestion des choix
    const gameIndex = GameService.utils.findGameIndexBySocketId(
      games,
      socket.id
    );

    games[gameIndex].gameState.choices.idSelectedChoice = data.choiceId;

    updateClientsViewChoices(games[gameIndex]);
    updateClientsViewGrid(games[gameIndex]);
  });

  socket.on("game.grid.selected", (data) => {
    const gameIndex = GameService.utils.findGameIndexBySocketId(
      games,
      socket.id
    );

    // La sélection d'une cellule signifie la fin du tour (ou plus tard le check des conditions de victoires)
    // On reset l'état des cases qui étaient précédemment clicables.
    games[gameIndex].gameState.grid = GameService.grid.resetcanBeCheckedCells(
      games[gameIndex].gameState.grid
    );

    games[gameIndex].gameState.grid = GameService.grid.selectCell(
      data.cellId,
      data.rowIndex,
      data.cellIndex,
      games[gameIndex].gameState.currentTurn,
      games[gameIndex].gameState.grid
    );

    // TODO: Ici calculer le score
    // TODO: Puis check si la partie s'arrête (lines / diagolales / no-more-gametokens)
    GameService.score.detectAlignmentTypeAndScore(
      games[gameIndex].gameState,
      data.rowIndex,
      data.cellIndex
    ); // i'm coding this function

    // Sinon on finit le tour
    games[gameIndex].gameState.currentTurn =
      games[gameIndex].gameState.currentTurn === "player:1"
        ? "player:2"
        : "player:1";
    games[gameIndex].gameState.timer = GameService.timer.getTurnDuration();
    const VictoryResult = GameService.victory.checkVictory(games[gameIndex].gameState);
    if (VictoryResult.winner != null) {
      console.log("VictoryResult: ", VictoryResult);
      games[gameIndex].player1Socket.emit(
        "game.game-over",
        GameService.send.forPlayer.victoryState(VictoryResult)
      );
      games[gameIndex].player2Socket.emit(
        "game.game-over",
        GameService.send.forPlayer.victoryState(VictoryResult)
      );
      // clearInterval(games[gameIndex].gameInterval);
      // games.splice(gameIndex, 1);
      // return;
      // fin de la partie
      // on stoppe tout
    }
    // On remet le deck et les choix à zéro (la grille, elle, ne change pas)
    games[gameIndex].gameState.deck = GameService.init.deck();
    games[gameIndex].gameState.choices = GameService.init.choices();

    // On reset le timer
    games[gameIndex].player1Socket.emit(
      "game.timer",
      GameService.send.forPlayer.gameTimer(
        "player:1",
        games[gameIndex].gameState
      )
    );
    games[gameIndex].player2Socket.emit(
      "game.timer",
      GameService.send.forPlayer.gameTimer(
        "player:2",
        games[gameIndex].gameState
      )
    );

    // et on remet à jour la vue
    updateClientsViewDecks(games[gameIndex]);
    updateClientsViewChoices(games[gameIndex]);
    updateClientsViewGrid(games[gameIndex]);
    updateClientsViewPlayersInfos(games[gameIndex]);
  });

  socket.on("disconnect", (reason) => {
    console.log(`[${socket.id}] socket disconnected - ${reason}`);
  });
});

// -----------------------------------
// -------- SERVER METHODS -----------
// -----------------------------------

app.get("/", (req, res) => res.sendFile("index.html"));

http.listen(3000, function () {
  console.log("listening on *:3000");
});
