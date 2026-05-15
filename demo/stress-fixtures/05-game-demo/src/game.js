const config = {
  type: Phaser.AUTO,
  width: 800,
  height: 480,
  scene: {
    create() {
      this.add.text(20, 20, 'Game demo');
    }
  }
};

new Phaser.Game(config);
