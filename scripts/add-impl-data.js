#!/usr/bin/env node
// scripts/add-impl-data.js
// Adds implementation case data to packet JSONs based on 30+ verified 1.8.9 clients
'use strict';

const fs = require('fs');
const path = require('path');

const PACKETS_DIR = path.join(__dirname, '..', 'data', 'packets');

// Implementation data per packet — compiled from 30+ verified 1.8.9 clients
// Format: { modules: [], pattern: "", code: "", hook: "", clients: [] }
const IMPL = {
  // === HANDSHAKE ===
  C00Handshake: {
    modules: ['ServerCrasher', 'FakeConnections'],
    pattern: 'Not commonly intercepted by modules — handled by vanilla NetHandlerHandshakeTCP.',
    code: null,
    hook: null,
    clients: []
  },

  // === LOGIN ===
  C00PacketLoginStart: {
    modules: ['NameSpoof', 'CrackedBypass'],
    pattern: 'Intercept login start to spoof username before authentication.',
    code: 'if (event.getPacket() instanceof C00PacketLoginStart) {\n  ((C00PacketLoginStart) event.getPacket()).gameProfile.name = "SpoofedName";\n}',
    hook: 'EventSendPacket',
    clients: ['Gugustus']
  },
  C01PacketEncryptionResponse: {
    modules: ['CrackedBypass'],
    pattern: 'Cancel encryption response to skip premium authentication.',
    code: 'if (event.getPacket() instanceof C01PacketEncryptionResponse) event.setCancelled(true);',
    hook: 'EventSendPacket',
    clients: ['Jigsaw 0.26']
  },
  S00PacketDisconnect: {
    modules: ['AutoReconnect', 'AntiKick'],
    pattern: 'Detect kick/disconnect, cancel or auto-rejoin.',
    code: 'if (event.getPacket() instanceof S00PacketDisconnect) {\n  event.setCancelled(true);\n  AutoReconnect.reconnect();\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 5.1', 'Gugustus']
  },
  S01PacketEncryptionRequest: {
    modules: ['CrackedBypass', 'AuthSpoof'],
    pattern: 'Intercept encryption request, respond with fake authentication.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S02PacketLoginSuccess: {
    modules: ['SessionStealer', 'SessionInfo'],
    pattern: 'Capture login success data (UUID, username) for session management.',
    code: 'if (event.getPacket() instanceof S02PacketLoginSuccess) {\n  S02PacketLoginSuccess s02 = (S02PacketLoginSuccess) event.getPacket();\n  // store s02.getProfile().getId() and getName()\n}',
    hook: 'EventReceivePacket',
    clients: ['November 0.2']
  },
  S03PacketEnableCompression: {
    modules: ['Disabler'],
    pattern: 'Cancel or delay compression to prevent server-side anti-cheat from reading packets.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },

  // === STATUS ===
  C00PacketServerQuery: {
    modules: ['ServerScanner'],
    pattern: 'Send server list pings for IP scanning.',
    code: null,
    hook: null,
    clients: ['Jigsaw 0.26']
  },
  C01PacketPing: {
    modules: ['ServerScanner', 'PingSpoof'],
    pattern: 'Manipulate or delay ping response to fake latency.',
    code: null,
    hook: null,
    clients: []
  },
  S00PacketServerInfo: {
    modules: ['ServerInfo', 'BrandDetector'],
    pattern: 'Read server info JSON (MOTD, players, version) for server detection.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S01PacketPong: {
    modules: ['PingSpoof'],
    pattern: 'Delay pong processing to fake higher ping in server list.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },

  // === PLAY SERVERBOUND ===
  C00PacketKeepAlive: {
    modules: ['PingSpoof', 'Disabler', 'Timer'],
    pattern: 'Delay/cancel/replace keepalive to spoof ping or bypass anti-cheat timing checks.',
    code: '// PingSpoof — delay response\nif (event.getPacket() instanceof S00PacketKeepAlive) {\n  event.setCancelled();\n  keepAliveQueue.add(new C00PacketKeepAlive(s00.func_149134_c() + offset));\n}\n// Disabler — cancel\nif (event.getPacket() instanceof C00PacketKeepAlive) event.setCancelled(true);\n// Disabler — spoof key\nC00PacketKeepAlive c00 = (C00PacketKeepAlive) event.getPacket();\nc00.key -= RandomUtils.nextInt(3, 128);',
    hook: 'EventSendPacket / EventReceivePacket',
    clients: ['Astro 2.2.1', 'Tenacity 5.1', 'Sigma 3.9', 'Lycoris 2.0', 'November 0.2', 'Memeware 7.3', 'Jigsaw 0.24']
  },
  C01PacketChatMessage: {
    modules: ['AutoGG', 'Spammer', 'ChatBypass', 'Commands', 'AutoRegister'],
    pattern: 'Send or intercept chat messages. AutoGG sends "gg" after death. Spammer sends repeating messages. ChatBypass modifies outgoing messages. Command system intercepts C01 for .prefix commands.',
    code: '// Send\nmc.thePlayer.sendQueue.addToSendQueue(new C01PacketChatMessage("gg"));\n// Intercept commands\nif (event.getPacket() instanceof C01PacketChatMessage) {\n  C01PacketChatMessage packet = (C01PacketChatMessage) event.getPacket();\n  if (packet.getMessage().startsWith(".")) { event.setCancelled(true); processCommand(packet.getMessage()); }\n}\n// Bypass — cancel + re-send with modification\nif (event.getPacket() instanceof C01PacketChatMessage) {\n  event.setCancelled(true);\n  String modified = ((C01PacketChatMessage)event.getPacket()).getMessage().replace("%","");\n  mc.thePlayer.sendQueue.addToSendQueue(new C01PacketChatMessage(modified));\n}',
    hook: 'EventSendPacket / sendChatMessage override',
    clients: ['Astro 2.2.1', 'Flux B39.11', 'Sigma 3.9', 'Jigsaw 0.26', 'November 0.2', 'Nekoware v1', 'Memeware 7.3']
  },
  C02PacketUseEntity: {
    modules: ['KillAura', 'AutoClicker', 'NoDamageFriends', 'Criticals', 'TriggerBot'],
    pattern: 'Send ATTACK action on target entities. Criticals intercept and inject C04 offset packets before the attack. NoDamageFriends cancels attacks on friend entities. AutoClicker sends attacks on mouse-over entities.',
    code: '// Attack\nmc.thePlayer.sendQueue.addToSendQueue(new C02PacketUseEntity(target, C02PacketUseEntity.Action.ATTACK));\n// NoFriendDamage — cancel\nif (event.getPacket() instanceof C02PacketUseEntity) {\n  C02PacketUseEntity c02 = (C02PacketUseEntity) event.getPacket();\n  if (c02.getAction() == C02PacketUseEntity.Action.ATTACK && isFriend(c02.getEntityFromWorld()))\n    event.setCancelled(true);\n}\n// Criticals — inject offsets\nif (event.getPacket() instanceof C02PacketUseEntity && ((C02PacketUseEntity)event.getPacket()).getAction() == ATTACK) {\n  for (double offset : offsets)\n    mc.thePlayer.sendQueue.addToSendQueue(new C04PacketPlayerPosition(x, y + offset, z, false));\n}',
    hook: 'EventSendPacket / onTick + attackEntity',
    clients: ['Tenacity 5.1', 'Sigma 3.9', 'Gugustus', 'Mint B1', 'Koks v1', 'Ketamine v5.7', 'Lycoris 2.0', 'Slice v15', 'Jigsaw 0.24']
  },
  'C03PacketPlayer': {
    modules: ['Flight', 'Speed', 'NoFall', 'Blink', 'Criticals', 'Damage', 'Phase', 'Step', 'NoVoid', 'Scaffold', 'AntiVoid', 'Regen'],
    pattern: 'The most heavily-modded packet. Flight cancels S08 and sends spoofed C06. Speed modifies C04 with onGround=true at precise offsets. NoFall sets onGround=true. Blink buffers all C03 packets and releases them at once. Criticals sends micro-offset C04 before attacks. Damage sends C04 with large Y offset for self-damage. Step injects staged C04 packets for block stepping.',
    code: '// NoFall — set ground\nif (event.getPacket() instanceof C03PacketPlayer) {\n  ((C03PacketPlayer)event.getPacket()).setOnGround(true);\n}\n// Blink — buffer + release\nif (event.getPacket() instanceof C03PacketPlayer) { packets.add(event.getPacket()); event.setCancelled(true); }\n// onDisable: packets.forEach(p -> sendPacketNoEvent(p));\n// Flight packet mode — cancel S08, send spoofed C06\nif (event.getPacket() instanceof S08PacketPlayerPosLook) {\n  S08PacketPlayerPosLook s08 = (S08PacketPlayerPosLook) event.getPacket();\n  event.setCancelled(true);\n  mc.thePlayer.sendQueue.addToSendQueue(new C06PacketPlayerPosLook(s08.x, mc.thePlayer.posY, s08.z, s08.yaw, s08.pitch, false));\n}\n// Speed — ground spoof\nmc.thePlayer.sendQueue.addToSendQueue(new C04PacketPlayerPosition(x, y + 0.42, z, true));\n// Criticals — offset\nmc.thePlayer.sendQueue.addToSendQueue(new C04PacketPlayerPosition(x, y + 0.0625, z, false));\nmc.thePlayer.sendQueue.addToSendQueue(new C04PacketPlayerPosition(x, y, z, false));',
    hook: 'EventSendPacket (C03/C04/C05/C06) + EventReceivePacket (S08)',
    clients: ['Gugustus', 'Mint B1', 'Koks v1', 'Tenacity 6.0', 'Sigma 4.11', 'Vestige 3.0', 'November 0.2', 'Lycoris 2.0', 'Jigsaw 0.26']
  },
  C07PacketPlayerDigging: {
    modules: ['Nuker', 'Fucker', 'Scaffold', 'NoSlowdown', 'Autoblock', 'FastBreak', 'SpeedMine'],
    pattern: 'START/STOP_DESTROY_BLOCK for nuker/speedmine. RELEASE_USE_ITEM for autoblock (releases right-click after attack). DROP_ITEM for inventory management or NoSlow bypass.',
    code: '// Nuker\nmc.thePlayer.sendQueue.addToSendQueue(new C07PacketPlayerDigging(C07PacketPlayerDigging.Action.START_DESTROY_BLOCK, pos, EnumFacing.UP));\nmc.thePlayer.sendQueue.addToSendQueue(new C07PacketPlayerDigging(C07PacketPlayerDigging.Action.STOP_DESTROY_BLOCK, pos, EnumFacing.UP));\n// Autoblock\nmc.thePlayer.sendQueue.addToSendQueue(new C07PacketPlayerDigging(C07PacketPlayerDigging.Action.RELEASE_USE_ITEM, BlockPos.ORIGIN, EnumFacing.DOWN));\n// NoSlow\nmc.thePlayer.sendQueue.addToSendQueue(new C07PacketPlayerDigging(C07PacketPlayerDigging.Action.RELEASE_USE_ITEM, BlockPos.ORIGIN, EnumFacing.DOWN));',
    hook: 'EventSendPacket / onTick',
    clients: ['Slice v15', 'Mint B1', 'Gugustus', 'Koks v1', 'Swift Developer Alpha', 'Tenacity 6.0']
  },
  C08PacketPlayerBlockPlacement: {
    modules: ['Scaffold', 'KillAura (Autoblock)', 'NoSlowdown', 'FastUse'],
    pattern: 'Scaffold places blocks silently. Autoblock sends invalid placement (pos=-1,-1,-1, face=255) to start blocking. NoSlow sends C08 with current item to bypass use-item slowdown.',
    code: '// Autoblock (start blocking)\nmc.thePlayer.sendQueue.addToSendQueue(new C08PacketPlayerBlockPlacement(new BlockPos(-1, -1, -1), 255, mc.thePlayer.getHeldItem(), 0, 0, 0));\n// Scaffold — silent place\nmc.getNetHandler().addToSendQueue(new C08PacketPlayerBlockPlacement(blockPos, direction, itemStack, faceX, faceY, faceZ));\n// NoSlow — bypass\nmc.getNetHandler().addToSendQueue(new C08PacketPlayerBlockPlacement(new BlockPos(-1, -1, -1), 255, mc.thePlayer.getHeldItem(), 0, 0, 0));',
    hook: 'EventSendPacket',
    clients: ['Tenacity 6.0', 'Flux B39.11', 'Monsoon 3.0-A6', 'Mint B1', 'Gugustus']
  },
  C09PacketHeldItemChange: {
    modules: ['Scaffold', 'AutoTool', 'InventoryManager', 'AutoPot', 'NoSlow', 'AutoGApple'],
    pattern: 'Silent slot switching. Scaffold switches to block slot silently. AutoTool switches to best tool. AutoPot switches to potion slot. Always paired with a switch back to original slot.',
    code: '// Silent switch to block slot\nmc.thePlayer.sendQueue.addToSendQueue(new C09PacketHeldItemChange(blockSlot));\n// ... place block ...\nmc.thePlayer.sendQueue.addToSendQueue(new C09PacketHeldItemChange(originalSlot));\n// Cancel real slot changes during scaffold\nif (event.getPacket() instanceof C09PacketHeldItemChange) event.setCancelled(true);\n// NoSlow — send current slot to bypass slowdown\nmc.thePlayer.sendQueue.addToSendQueueSilent(new C09PacketHeldItemChange(mc.thePlayer.inventory.currentItem));',
    hook: 'EventSendPacket',
    clients: ['Tenacity 6.0', 'Flux B39.11', 'Monsoon 3.0-A6', 'Gugustus', 'Vestige 3.0', 'November 0.2', 'Jigsaw 0.26']
  },
  C0APacketAnimation: {
    modules: ['NoSwing', 'Animation'],
    pattern: 'Cancel or fake swing animation. NoSwing cancels the arm swing packet.',
    code: 'if (event.getPacket() instanceof C0APacketAnimation) event.setCancelled(true);',
    hook: 'EventSendPacket',
    clients: ['Gugustus']
  },
  C0BPacketEntityAction: {
    modules: ['Sprint', 'Sneak', 'Scaffold', 'KeepSprint', 'Flight', 'Speed', 'WTap', 'NoSlow'],
    pattern: 'START/STOP_SPRINTING for keep-sprint and WTap. START/STOP_SNEAKING for scaffold silent sneak. KeepSprint cancels incoming STOP_SPRINTING. Flight sends START_FALL_FLYING for elytra exploit. Disabler cancels all C0B packets.',
    code: '// KeepSprint — cancel server STOP_SPRINTING\nif (event.getPacket() instanceof C0BPacketEntityAction && ((C0BPacketEntityAction)event.getPacket()).getAction() == STOP_SPRINTING)\n  event.setCancelled(true);\n// Scaffold sneak\nmc.thePlayer.sendQueue.addToSendQueue(new C0BPacketEntityAction(mc.thePlayer, C0BPacketEntityAction.Action.START_SNEAKING));\n// ... bridge ...\nmc.thePlayer.sendQueue.addToSendQueue(new C0BPacketEntityAction(mc.thePlayer, C0BPacketEntityAction.Action.STOP_SNEAKING));\n// WTap — sprint reset\nPacketUtils.sendPacketNoEvent(new C0BPacketEntityAction(mc.thePlayer, Action.STOP_SPRINTING));\nPacketUtils.sendPacketNoEvent(new C0BPacketEntityAction(mc.thePlayer, Action.START_SPRINTING));',
    hook: 'EventSendPacket / EventReceivePacket',
    clients: ['Tenacity 5.1', 'Sigma 3.9', 'Flux B39.11', 'Gugustus', 'Jigsaw 0.26', 'November 0.2', 'Raze Recode 2.0', 'Koks v1', 'Helium B41420']
  },
  C0CPacketInput: {
    modules: ['BoatFly', 'HorseJump', 'VehicleSpeed'],
    pattern: 'Spoof vehicle input values (sideways, forward, jump/unmount flags) for vehicle speed hacks.',
    code: 'if (event.getPacket() instanceof C0CPacketInput) {\n  C0CPacketInput c0c = (C0CPacketInput) event.getPacket();\n  // modify sideways/forward for speed\n  c0c.forward = 1.0f; // max forward\n}',
    hook: 'EventSendPacket',
    clients: ['Monsoon 3.0-A6', 'Tenacity 6.0']
  },
  C0EPacketClickWindow: {
    modules: ['ChestStealer', 'AutoArmor', 'InvManager', 'AutoPot'],
    pattern: 'Usually NOT constructed directly — modules use mc.playerController.windowClick() which sends C0E internally. Disabler cancels C0E to prevent server from detecting fast inventory actions.',
    code: '// Vanilla sends this through PlayerControllerMP:\nthis.connection.sendPacket(new C0EPacketClickWindow(windowId, slotId, mouseButton, mode, itemStack, actionNumber));\n// Disabler — cancel\nevent.setCancelled(true);',
    hook: 'EventSendPacket / PlayerControllerMP.windowClick()',
    clients: ['Vestige 3.0', 'Gugustus']
  },
  C0FPacketConfirmTransaction: {
    modules: ['Disabler', 'PingSpoof', 'Velocity', 'InvManager'],
    pattern: 'Delay/cancel/replace transaction confirmations. Disabler buffers C0F+C00 and releases after delay. Velocity cancels C0F when hurt to negate knockback. PingSpoof queues C0F for delayed release.',
    code: '// Disabler — buffer + release\nif (event.getPacket() instanceof C0FPacketConfirmTransaction) {\n  event.setCancelled(true);\n  transactionQueue.add(event.getPacket());\n}\n// ... after delay, flush: transactionQueue.forEach(PacketUtils::sendPacketNoEvent);\n// Spoof transaction\nmc.getNetHandler().addToSendQueueSilent(new C0FPacketConfirmTransaction(Integer.MAX_VALUE, uid, false));',
    hook: 'EventSendPacket',
    clients: ['Tenacity 5.1', 'Sigma 3.9', 'Lycoris 2.0', 'November 0.2', 'Memeware 7.3', 'Raze v1.5b']
  },
  C10PacketCreativeInventoryAction: {
    modules: ['CreativeFly', 'CreativeGive'],
    pattern: 'Drop/set items in creative mode. Used by creative-mode exploits.',
    code: null,
    hook: 'EventSendPacket',
    clients: []
  },
  C11PacketEnchantItem: {
    modules: ['AutoEnchant'],
    pattern: 'Select enchantment option. Used by auto-enchant modules.',
    code: null,
    hook: 'EventSendPacket',
    clients: []
  },
  C12PacketUpdateSign: {
    modules: ['SignEditor', 'ColorSigns'],
    pattern: 'Send sign text to server after editing.',
    code: null,
    hook: 'EventSendPacket',
    clients: []
  },
  C13PacketPlayerAbilities: {
    modules: ['Flight', 'CreativeFly'],
    pattern: 'Toggle flying state. Client sends isFlying=true to tell server player started flying.',
    code: 'mc.thePlayer.sendQueue.addToSendQueue(new C13PacketPlayerAbilities());',
    hook: 'EventSendPacket',
    clients: ['Gugustus', 'Tenacity 6.0']
  },
  C14PacketTabComplete: {
    modules: ['AntiTabComplete'],
    pattern: 'Cancel tab-complete requests to hide commands from server logs.',
    code: null,
    hook: 'EventSendPacket',
    clients: []
  },
  C15PacketClientSettings: {
    modules: ['ServerCrasher', 'LocalSpoof'],
    pattern: 'Send fake locale/view distance settings. Can be part of server crash exploits.',
    code: null,
    hook: 'EventSendPacket',
    clients: []
  },
  C16PacketClientStatus: {
    modules: ['AutoRespawn', 'InvManager', 'ArmorManager', 'Disabler', 'InventoryWalk'],
    pattern: 'PERFORM_RESPAWN for auto-respawn after death. OPEN_INVENTORY_ACHIEVEMENT for silent inventory opening (used by ChestStealer, AutoArmor, etc.). Disabler cancels C16 for bypass.',
    code: '// AutoRespawn\nif (mc.thePlayer.isDead) mc.thePlayer.sendQueue.addToSendQueue(new C16PacketClientStatus(C16PacketClientStatus.EnumState.PERFORM_RESPAWN));\n// Silent inventory\nmc.thePlayer.sendQueue.addToSendQueue(new C16PacketClientStatus(C16PacketClientStatus.EnumState.OPEN_INVENTORY_ACHIEVEMENT));\n// Disabler — cancel\nif (event.getPacket() instanceof C16PacketClientStatus) event.setCancelled(true);',
    hook: 'EventSendPacket',
    clients: ['Tenacity 5.1', 'Astro 2.2.1', 'Gugustus', 'Monsoon 3.0-A6', 'Sigma 3.9', 'Vestige 3.0', 'November 0.2', 'Lycoris 2.0']
  },
  C17PacketCustomPayload: {
    modules: ['BrandChanger', 'Disabler', 'ServerCrasher', 'LunarSpoofer'],
    pattern: 'Spoof client brand on "MC|Brand" channel. ServerCrasher sends crafted payloads on "MC|AdvCdm". Disabler sends fake BLC brand for Badlion Client emulation. Vanilla sends brand, beacon, trading, book, anvil channels.',
    code: '// Brand spoof\nif (event.getPacket() instanceof C17PacketCustomPayload) {\n  C17PacketCustomPayload c17 = (C17PacketCustomPayload) event.getPacket();\n  if (c17.getChannelName().equals("MC|Brand")) {\n    event.setCancelled(true);\n    mc.thePlayer.sendQueue.addToSendQueue(new C17PacketCustomPayload("MC|Brand", new PacketBuffer(Unpooled.buffer()).writeString("vanilla")));\n  }\n}\n// Lunar brand spoof\nmc.thePlayer.sendQueue.addToSendQueue(new C17PacketCustomPayload("REGISTER", new PacketBuffer(message).writeString("Lunar-Client")));',
    hook: 'EventSendPacket',
    clients: ['November 0.2 (LunarSpoofer)', 'Gugustus (BLC spoof)', 'Lycoris 2.0 (ServerCrasher)', 'Sigma 3.9']
  },
  C18PacketSpectate: {
    modules: ['Freecam'],
    pattern: 'Teleport spectator to another entity. Used by Freecam for entity tracking.',
    code: null,
    hook: 'EventSendPacket',
    clients: []
  },
  C19PacketResourcePackStatus: {
    modules: ['AntiResourcePack'],
    pattern: 'Cancel resource pack downloads or fake acceptance.',
    code: 'if (event.getPacket() instanceof C19PacketResourcePackStatus) event.setCancelled(true);',
    hook: 'EventSendPacket',
    clients: []
  },

  // === PLAY CLIENTBOUND ===
  S00PacketKeepAlive: {
    modules: ['PingSpoof', 'Disabler', 'Timer', 'Backtrack'],
    pattern: 'Delay/cancel incoming keepalive. PingSpoof delays S00 and sends back C00 with modified key. Disabler cancels S00 entirely. Backtrack buffers S00 for delayed processing.',
    code: '// PingSpoof — delay + modify response\nif (event.getPacket() instanceof S00PacketKeepAlive) {\n  event.setCancelled();\n  S00PacketKeepAlive s00 = (S00PacketKeepAlive) event.getPacket();\n  mc.getNetHandler().getNetworkManager().sendPacket(new C00PacketKeepAlive(s00.func_149134_c() + mc.getDebugFPS() / 2));\n}',
    hook: 'EventReceivePacket',
    clients: ['Astro 2.2.1', 'Tenacity 5.1', 'Sigma 3.9', 'Lycoris 2.0', 'Helium B41420']
  },
  S01PacketJoinGame: {
    modules: ['SessionInfo', 'AutoRegister', 'NameProtect'],
    pattern: 'Capture entity ID, gamemode, dimension on join. Used by modules for initialization.',
    code: 'if (event.getPacket() instanceof S01PacketJoinGame) {\n  S01PacketJoinGame s01 = (S01PacketJoinGame) event.getPacket();\n  playerEntityId = s01.getEntityId();\n  gamemode = s01.getGameType();\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0']
  },
  S02PacketChat: {
    modules: ['AutoGG', 'NameProtect', 'AutoTPA', 'StreamerMode', 'ChatFilter', 'AutoPlay', 'DeathInsult', 'FlagDetector'],
    pattern: 'Most commonly intercepted clientbound packet. AutoGG detects game-end messages. NameProtect replaces player name. AutoTPA auto-accepts teleport requests. AutoPlay auto-queues after game end. FlagDetector detects anti-cheat messages.',
    code: '// AutoGG + AutoPlay\nif (event.getPacket() instanceof S02PacketChat) {\n  S02PacketChat s02 = (S02PacketChat) event.getPacket();\n  String msg = s02.getChatComponent().getUnformattedText();\n  if (msg.contains("1st Killer - ") || msg.contains("Winner: ")) {\n    mc.thePlayer.sendChatMessage("/play solo_insane"); // AutoPlay\n    mc.thePlayer.sendChatMessage("gg");                // AutoGG\n  }\n}\n// NameProtect\nif (msg.contains(mc.thePlayer.getName())) {\n  event.setCancelled(true);\n  String replaced = msg.replace(mc.thePlayer.getName(), "You");\n  ChatUtil.printChat(replaced);\n}',
    hook: 'EventReceivePacket / onChatMessage',
    clients: ['Sigma 3.9', 'Astro 2.2.1', 'Tenacity 5.1', 'Gugustus', 'November 0.2', 'Lycoris 2.0', 'Jigsaw 0.26', 'Helium B41420', 'Memeware 7.3']
  },
  S03PacketTimeUpdate: {
    modules: ['Ambience', 'TimeChanger', 'WorldTime'],
    pattern: 'Cancel or modify world time for custom day/night cycle.',
    code: 'if (event.getPacket() instanceof S03PacketTimeUpdate) {\n  S03PacketTimeUpdate s03 = (S03PacketTimeUpdate) event.getPacket();\n  event.setCancelled(true);\n  // Send modified time\n}',
    hook: 'EventReceivePacket',
    clients: ['Gugustus', 'Tenacity 6.0']
  },
  S04PacketEntityEquipment: {
    modules: ['ESP', 'ArmorHUD', 'AntiBot'],
    pattern: 'Track entity equipment changes for ESP display and bot detection.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Sigma 3.9']
  },
  S05PacketSpawnPosition: {
    modules: ['Compass', 'WorldInfo'],
    pattern: 'Read world spawn for compass/waypoint modules.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S06PacketUpdateHealth: {
    modules: ['AutoRespawn', 'AutoPot', 'Regen', 'GodMode'],
    pattern: 'Detect health changes. AutoRespawn triggers on health<=0. AutoPot uses health thresholds. GodMode cancels health update.',
    code: 'if (event.getPacket() instanceof S06PacketUpdateHealth) {\n  S06PacketUpdateHealth s06 = (S06PacketUpdateHealth) event.getPacket();\n  if (s06.getHealth() <= 0) autoRespawn();\n  if (s06.getHealth() < threshold) autoPot();\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 5.1', 'Sigma 3.9', 'Gugustus']
  },
  S07PacketRespawn: {
    modules: ['DimensionDetector', 'WorldChange'],
    pattern: 'Detect dimension change for module state reset.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0']
  },
  S08PacketPlayerPosLook: {
    modules: ['Flight', 'Speed', 'NoRotate', 'Freecam', 'Disabler', 'NoClip', 'Blink', 'FlagDetector', 'Backtrack'],
    pattern: 'Second most-modded clientbound packet. Flight cancels S08 and sends spoofed C06 to maintain position. Speed cancels to prevent rubberbanding. Freecam cancels to keep camera free. NoRotate strips rotation. NoClip sends confirm + position back then cancels. FlagDetector auto-disables modules on S08 (lag-back detection). Backtrack buffers S08 for delayed processing to extend reach.',
    code: '// Flight — cancel S08 + spoof position\nif (event.getPacket() instanceof S08PacketPlayerPosLook) {\n  S08PacketPlayerPosLook s08 = (S08PacketPlayerPosLook) event.getPacket();\n  event.setCancelled(true);\n  mc.thePlayer.sendQueue.addToSendQueue(new C06PacketPlayerPosLook(s08.x, mc.thePlayer.posY, s08.z, s08.yaw, s08.pitch, false));\n}\n// FlagDetector — auto-disable\nif (event.getPacket() instanceof S08PacketPlayerPosLook && speedModule.isEnabled()) speedModule.toggle();\n// NoRotate — strip yaw/pitch\nif (event.getPacket() instanceof S08PacketPlayerPosLook) {\n  S08PacketPlayerPosLook s08 = (S08PacketPlayerPosLook) event.getPacket();\n  s08.yaw = mc.thePlayer.rotationYaw;\n  s08.pitch = mc.thePlayer.rotationPitch;\n}\n// Freecam — cancel\nif (event.getPacket() instanceof S08PacketPlayerPosLook) event.setCancelled(true);',
    hook: 'EventReceivePacket',
    clients: ['Mint B1', 'Gugustus', 'Tenacity 6.0', 'Sigma 4.11', 'Vestige 3.0', 'Astro 2.2.1', 'Flux B39.11']
  },
  S09PacketHeldItemChange: {
    modules: ['AutoTool', 'InventoryManager'],
    pattern: 'Detect forced slot change from server. Respond with slot sync.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S0APacketUseBed: {
    modules: ['AntiBed', 'BedAura'],
    pattern: 'Detect when another player sleeps in a bed.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S0BPacketAnimation: {
    modules: ['ESP', 'Tracers', 'AntiBot'],
    pattern: 'Track entity animations (swing, damage, crit) for ESP effects and bot detection.',
    code: 'if (event.getPacket() instanceof S0BPacketAnimation) {\n  S0BPacketAnimation s0b = (S0BPacketAnimation) event.getPacket();\n  // type: 0=swing, 1=damage, 2=leaveBed, 3=eat, 4=crit, 5=magicCrit\n}',
    hook: 'EventReceivePacket',
    clients: ['Sigma 3.9']
  },
  S0CPacketSpawnPlayer: {
    modules: ['ESP', 'NameTags', 'AntiBot', 'Teams'],
    pattern: 'Detect player spawns for ESP targets and bot filtering. AntiBot checks spawn data for fake players.',
    code: 'if (event.getPacket() instanceof S0CPacketSpawnPlayer) {\n  S0CPacketSpawnPlayer s0c = (S0CPacketSpawnPlayer) event.getPacket();\n  if (isValidPlayer(s0c)) targetList.add(s0c.getEntityID());\n}',
    hook: 'EventReceivePacket',
    clients: ['Sigma 3.9', 'Tenacity 6.0']
  },
  S0DPacketCollectItem: {
    modules: ['ItemESP', 'ItemStealer'],
    pattern: 'Track item pickups. ItemESP uses for visual effects.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S0EPacketSpawnObject: {
    modules: ['ESP', 'ProjSim', 'AntiBot', 'Tracers', 'AntiFireball'],
    pattern: 'Track spawned objects (arrows, fireballs, falling blocks, armor stands, etc.) for ESP, projectile simulation, and bot detection. AntiFireball attacks fireball entities.',
    code: '// AntiFireball — attack fireballs\nif (event.getPacket() instanceof S0EPacketSpawnObject) {\n  S0EPacketSpawnObject s0e = (S0EPacketSpawnObject) event.getPacket();\n  if (s0e.func_148993_l() == 63) // fireball type\n    mc.thePlayer.sendQueue.addToSendQueue(new C02PacketUseEntity(entity, Action.ATTACK));\n}\n// AntiBot — filter fake entities\nif (s0e.func_148993_l() == 73) { // armor stand\n  if (isBot(s0e)) return; // filter\n}',
    hook: 'EventReceivePacket',
    clients: ['Gugustus (AntiFireball)', 'Raze v1.5b (AntiExploit)', 'Sigma 3.9']
  },
  S0FPacketSpawnMob: {
    modules: ['ESP', 'AntiBot', 'Tracers', 'KillAura'],
    pattern: 'Detect mob spawns. KillAura adds to target list. AntiBot filters mobs for bot detection. ESP shows mob info.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0', 'Sigma 3.9', 'Gugustus']
  },
  S10PacketSpawnPainting: {
    modules: ['ESP', 'WorldEdit'],
    pattern: 'Detect paintings for ESP.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S11PacketSpawnExperienceOrb: {
    modules: ['XPBottler', 'AutoCollect'],
    pattern: 'Detect XP orbs for auto-collect.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S12PacketEntityVelocity: {
    modules: ['Velocity', 'AntiKnockback', 'Backtrack'],
    pattern: 'Cancel or scale velocity. Most common anti-knockback implementation. Cancel entirely (100% antiKB) or scale motionX/Y/Z by percentage. Backtrack buffers S12 for delayed processing.',
    code: '// Cancel\nif (event.getPacket() instanceof S12PacketEntityVelocity) {\n  S12PacketEntityVelocity s12 = (S12PacketEntityVelocity) event.getPacket();\n  if (s12.getEntityID() == mc.thePlayer.getEntityId()) event.setCancelled(true);\n}\n// Scale\nif (s12.getEntityID() == mc.thePlayer.getEntityId()) {\n  s12.motionX *= horizontal / 100.0;\n  s12.motionY *= vertical / 100.0;\n  s12.motionZ *= horizontal / 100.0;\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 5.1', 'Sigma 3.9', 'Raze v1.5b', 'Gugustus', 'November 0.2', 'Nekoware v1', 'Memeware 7.3', 'Jigsaw 0.24', 'Helium B41420']
  },
  S13PacketDestroyEntities: {
    modules: ['ESP', 'TargetManager', 'KillAura'],
    pattern: 'Remove destroyed entities from target/ESP lists.',
    code: 'if (event.getPacket() instanceof S13PacketDestroyEntities) {\n  S13PacketDestroyEntities s13 = (S13PacketDestroyEntities) event.getPacket();\n  for (int id : s13.getEntityIDs()) targetList.remove(id);\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0', 'Sigma 3.9']
  },
  S14PacketEntity: {
    modules: ['ESP', 'Tracers', 'AntiBot'],
    pattern: 'Track entity position/rotation updates for ESP rendering. S15 (rel move), S16 (look), S17 (both).',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Sigma 3.9']
  },
  S18PacketEntityTeleport: {
    modules: ['ESP', 'Tracers', 'KillAura', 'Ranking'],
    pattern: 'Track entity teleports for ESP position sync and ranking detection.',
    code: 'if (event.getPacket() instanceof S18PacketEntityTeleport) {\n  S18PacketEntityTeleport s18 = (S18PacketEntityTeleport) event.getPacket();\n  updateTargetPosition(s18.getEntityId(), s18.getX()/32.0, s18.getY()/32.0, s18.getZ()/32.0);\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 4.0', 'Sigma 3.9', 'Lycoris 2.0']
  },
  S19PacketEntityHeadLook: {
    modules: ['ESP', 'Tracers', 'AntiAim'],
    pattern: 'Track entity head rotations for visual indicators.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S19PacketEntityStatus: {
    modules: ['ESP', 'DamageIndicator', 'KillAura'],
    pattern: 'Detect entity status changes (2=damage, 3=death, 9=eating) for visual effects.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0']
  },
  S1BPacketEntityAttach: {
    modules: ['ESP', 'AntiBot'],
    pattern: 'Track entity leashes and vehicle mounts.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S1CPacketEntityMetadata: {
    modules: ['ESP', 'NameTags', 'AntiBot'],
    pattern: 'Track entity metadata (name tags, visibility, flags) for ESP and bot detection.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Sigma 3.9']
  },
  S1DPacketEntityEffect: {
    modules: ['PotionHUD', 'AntiPotion'],
    pattern: 'Detect potion effects applied to entities. PotionHUD shows active effects. AntiPotion cancels negative effects.',
    code: 'if (event.getPacket() instanceof S1DPacketEntityEffect) {\n  S1DPacketEntityEffect s1d = (S1DPacketEntityEffect) event.getPacket();\n  if (s1d.getEntityId() == mc.thePlayer.getEntityId() && isNegativeEffect(s1d.getEffectId()))\n    event.setCancelled(true);\n}',
    hook: 'EventReceivePacket',
    clients: ['Sigma 3.9', 'Tenacity 6.0']
  },
  S1EPacketRemoveEntityEffect: {
    modules: ['PotionHUD'],
    pattern: 'Track potion effect removals for HUD updates.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S1FPacketSetExperience: {
    modules: ['XPHUD', 'AutoEnchant'],
    pattern: 'Track XP changes for HUD and auto-enchant.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S20PacketEntityProperties: {
    modules: ['AntiBot', 'TargetInfo'],
    pattern: 'Read entity attributes (speed, health, attack damage) for bot detection and target info.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S21PacketChunkData: {
    modules: ['XRay', 'Search', 'ChestESP', 'AntiChunkBan'],
    pattern: 'XRay cancels chunk data and sends only desired blocks. Search tracks blocks in chunks. ChestESP reads chest positions.',
    code: 'if (event.getPacket() instanceof S21PacketChunkData) {\n  S21PacketChunkData s21 = (S21PacketChunkData) event.getPacket();\n  // XRay: modify block data\n  // Search: scan for target blocks\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0', 'Sigma 3.9']
  },
  S22PacketMultiBlockChange: {
    modules: ['XRay', 'Search', 'ChestESP'],
    pattern: 'Track multiple block changes for XRay and search modules.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0']
  },
  S23PacketBlockChange: {
    modules: ['XRay', 'Search', 'ChestESP'],
    pattern: 'Track single block changes.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S24PacketBlockAction: {
    modules: ['ChestStealer'],
    pattern: 'Detect chest open/close actions for auto-steal.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Gugustus']
  },
  S25PacketBlockBreakAnim: {
    modules: ['ESP', 'Mining'],
    pattern: 'Track block break progress for visual indicators.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S26PacketMapChunkBulk: {
    modules: ['XRay', 'Search'],
    pattern: 'Same as S21 but for bulk chunk loading. XRay modifies bulk data.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0']
  },
  S27PacketExplosion: {
    modules: ['Velocity', 'AntiKnockback'],
    pattern: 'Cancel or scale explosion velocity alongside S12PacketEntityVelocity.',
    code: '// Cancel\nif (event.getPacket() instanceof S27PacketExplosion) {\n  S27PacketExplosion s27 = (S27PacketExplosion) event.getPacket();\n  s27.motionX *= horizontal / 100.0;\n  s27.motionY *= vertical / 100.0;\n  s27.motionZ *= horizontal / 100.0;\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 5.1', 'Sigma 3.9', 'Raze v1.5b', 'Gugustus', 'Jello 0.1', 'Helium B41420']
  },
  S28PacketEffect: {
    modules: ['ESP', 'ParticleSpoof'],
    pattern: 'Track world effects (record player, particles, etc.).',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S29PacketSoundEffect: {
    modules: ['ESP', 'SoundLocator'],
    pattern: 'Track named sounds for ESP — locate players by footsteps, chest opens, etc.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Gugustus']
  },
  S2APacketParticles: {
    modules: ['ESP', 'ParticleMultiplier'],
    pattern: 'Detect particles for ESP. Can multiply/enhance particle effects.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S2BPacketChangeGameState: {
    modules: ['AutoGG', 'NoRain', 'AntiDemo'],
    pattern: 'Detect game state changes. NoRain cancels rain start (reason=1/2). AutoGG detects game end (reason=4=credits).',
    code: '// NoRain\nif (event.getPacket() instanceof S2BPacketChangeGameState) {\n  S2BPacketChangeGameState s2b = (S2BPacketChangeGameState) event.getPacket();\n  if (s2b.getGameState() == 1 || s2b.getGameState() == 2) event.setCancelled(true);\n}',
    hook: 'EventReceivePacket',
    clients: ['Gugustus', 'Tenacity 6.0']
  },
  S2CPacketSpawnGlobalEntity: {
    modules: ['Weather', 'LightningDetector'],
    pattern: 'Detect lightning strikes.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S2DPacketOpenWindow: {
    modules: ['ChestStealer', 'InvManager', 'AutoArmor'],
    pattern: 'Detect window opening (chest, crafting table, etc.). ChestStealer triggers on GuiChest open.',
    code: 'if (event.getPacket() instanceof S2DPacketOpenWindow) {\n  S2DPacketOpenWindow s2d = (S2DPacketOpenWindow) event.getPacket();\n  if (s2d.getGuiId().equals("minecraft:chest")) chestStealer.enable();\n}',
    hook: 'EventReceivePacket',
    clients: ['Gugustus', 'Tenacity 6.0']
  },
  S2EPacketCloseWindow: {
    modules: ['ChestStealer', 'InvManager'],
    pattern: 'Detect window closing — disable auto-steal.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S2FPacketSetSlot: {
    modules: ['ChestStealer', 'InvManager', 'AutoArmor'],
    pattern: 'Track individual slot updates for inventory management.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S30PacketWindowItems: {
    modules: ['ChestStealer', 'InvManager', 'AutoArmor'],
    pattern: 'Full inventory sync — trigger auto-steal on chest contents.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0', 'Gugustus']
  },
  S31PacketWindowProperty: {
    modules: ['AutoEnchant', 'AutoBrewer'],
    pattern: 'Track furnace/enchanting/brewing progress.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S32PacketConfirmTransaction: {
    modules: ['Disabler', 'InvManager', 'Backtrack'],
    pattern: 'Cancel or delay transaction confirmations. Disabler buffers S32. Backtrack delays S32 for reach extension.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 5.1', 'Vestige 3.0', 'Gugustus']
  },
  S33PacketUpdateSign: {
    modules: ['AutoSign', 'SignScanner'],
    pattern: 'Read sign text from server.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S34PacketMaps: {
    modules: ['MapExploit', 'ESP'],
    pattern: 'Track map data updates.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S35PacketUpdateTileEntity: {
    modules: ['ChestESP', 'SpawnerFinder'],
    pattern: 'Track tile entity updates — find chests, spawners, beacons.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0']
  },
  S36PacketSignEditorOpen: {
    modules: ['AutoSign'],
    pattern: 'Detect sign editor opening for auto-fill.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S37PacketStatistics: {
    modules: ['StatSpoof'],
    pattern: 'Read player statistics.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S38PacketPlayerListItem: {
    modules: ['NameProtect', 'AntiBot', 'TabGUI'],
    pattern: 'Track player list changes for name protect and tab GUI. AntiBot uses tab list to verify real players.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Sigma 3.9', 'Tenacity 6.0']
  },
  S39PacketPlayerAbilities: {
    modules: ['Flight', 'GodMode', 'CreativeFly'],
    pattern: 'Detect ability changes. Flight checks allowFlying. GodMode tracks invulnerable.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0']
  },
  S3APacketTabComplete: {
    modules: ['AntiTabComplete', 'CommandHelper'],
    pattern: 'Intercept tab-complete results for command assistance.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S3BPacketScoreboardObjective: {
    modules: ['Scoreboard', 'AntiScoreboard'],
    pattern: 'Track scoreboard creation for HUD or cancel for clean display.',
    code: 'if (event.getPacket() instanceof S3BPacketScoreboardObjective) event.setCancelled(true);',
    hook: 'EventReceivePacket',
    clients: ['Gugustus']
  },
  S3CPacketUpdateScore: {
    modules: ['Scoreboard', 'AntiScoreboard'],
    pattern: 'Track/block score updates.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S3DPacketDisplayScoreboard: {
    modules: ['Scoreboard', 'AntiScoreboard'],
    pattern: 'Track/block scoreboard display.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S3EPacketTeams: {
    modules: ['Teams', 'NameProtect', 'ESP'],
    pattern: 'Track team creation for ESP colors and name protect.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Sigma 3.9']
  },
  S3FPacketCustomPayload: {
    modules: ['BrandDetector', 'ServerCrasher', 'AntiCheatDetector'],
    pattern: 'Read server brand from "MC|Brand" channel. Detect anti-cheat plugins from custom payloads.',
    code: 'if (event.getPacket() instanceof S3FPacketCustomPayload) {\n  S3FPacketCustomPayload s3f = (S3FPacketCustomPayload) event.getPacket();\n  if (s3f.getChannelName().equals("MC|Brand")) {\n    String brand = s3f.getBufferData().readStringFromBuffer(32767);\n    // detect server type\n  }\n}',
    hook: 'EventReceivePacket',
    clients: ['Flux B39.11 (Brand detection)', 'Lycoris 1.0 (Brand detection)']
  },
  S40PacketDisconnect: {
    modules: ['AutoReconnect', 'AntiKick', 'NameProtect'],
    pattern: 'Detect disconnect/kick. AutoReconnect reconnects. AntiKick cancels.',
    code: 'if (event.getPacket() instanceof S40PacketDisconnect) {\n  event.setCancelled(true);\n  AutoReconnect.reconnect();\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 5.1', 'Gugustus']
  },
  S41PacketServerDifficulty: {
    modules: ['DifficultyDetector'],
    pattern: 'Detect server difficulty for module configuration.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S42PacketCombatEvent: {
    modules: ['AutoGG', 'KillAura', 'DeathDetector'],
    pattern: 'Detect player death (ENTITY_DIED event) for AutoGG and kill aura target cleanup.',
    code: 'if (event.getPacket() instanceof S42PacketCombatEvent) {\n  S42PacketCombatEvent s42 = (S42PacketCombatEvent) event.getPacket();\n  if (s42.eventType == S42PacketCombatEvent.Event.ENTITY_DIED && s42.playerId == mc.thePlayer.getEntityId()) {\n    mc.thePlayer.sendChatMessage("gg");\n  }\n}',
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0', 'Sigma 3.9']
  },
  S43PacketCamera: {
    modules: ['Freecam', 'Spectator'],
    pattern: 'Detect camera entity change for spectator modules.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Gugustus']
  },
  S44PacketWorldBorder: {
    modules: ['WorldBorder', 'AntiBorder'],
    pattern: 'Track world border for bypass modules.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S45PacketTitle: {
    modules: ['Title', 'AntiTitle'],
    pattern: 'Cancel or modify title/subtitle messages.',
    code: 'if (event.getPacket() instanceof S45PacketTitle) event.setCancelled(true);',
    hook: 'EventReceivePacket',
    clients: ['Gugustus', 'Tenacity 6.0']
  },
  S46PacketSetCompressionLevel: {
    modules: ['Disabler'],
    pattern: 'Detect compression changes.',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  },
  S47PacketPlayerListHeaderFooter: {
    modules: ['TabGUI', 'HUD'],
    pattern: 'Track tab list header/footer for custom tab display.',
    code: null,
    hook: 'EventReceivePacket',
    clients: ['Tenacity 6.0']
  },
  S48PacketResourcePackSend: {
    modules: ['AntiResourcePack'],
    pattern: 'Cancel resource pack sends.',
    code: 'if (event.getPacket() instanceof S48PacketResourcePackSend) event.setCancelled(true);',
    hook: 'EventReceivePacket',
    clients: ['Gugustus']
  },
  S49PacketUpdateEntityNBT: {
    modules: ['NBTExploit', 'CommandBlock'],
    pattern: 'Read entity NBT data (command block minecarts).',
    code: null,
    hook: 'EventReceivePacket',
    clients: []
  }
};

function addImplData() {
  const files = fs.readdirSync(PACKETS_DIR).filter(f => f.endsWith('.json'));
  let updated = 0;

  for (const file of files) {
    const fpath = path.join(PACKETS_DIR, file);
    const json = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    const pktId = json.id;

    if (IMPL[pktId]) {
      json.implementation = IMPL[pktId];
      updated++;
    } else {
      // Generic fallback for packets without specific implementation data
      const dir = json.dir === 'SERVERBOUND' ? 'Client→Server' : 'Server→Client';
      json.implementation = {
        modules: [],
        pattern: `This ${dir} packet is usually handled by vanilla net/minecraft/ code. Most 1.8.9 client modules interact with packets through event systems that wrap NetworkManager.sendPacket() / NetHandlerPlayClient packet handlers.`,
        code: null,
        hook: null,
        clients: []
      };
    }

    fs.writeFileSync(fpath, JSON.stringify(json, null, 2));
    updated++;
  }

  console.log(`Added implementation data to ${updated} packets`);
}

addImplData();
