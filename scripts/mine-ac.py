#!/usr/bin/env python3
"""mine-ac.py — mine the cloned anticheat sources for every packet.

For each packet in data/packets/*.json, greps every cloned anticheat (from
AC_ROOT, default ../references/mc-client-sources/anticheats) for the packet's
MCP class name, its Mojang/ProtocolLib 1.8 name, and check-domain keywords.
Writes:

  data/ac-mined/<packetid>.txt   — per-AC, per-file grep corpus
  data/ac-mined/_index.json      — packet -> AC -> [relative file paths]

Usage:
  python3 scripts/mine-ac.py
  python3 scripts/mine-ac.py C03PacketPlayer
  AC_ROOT=/path python3 scripts/mine-ac.py
"""
import json
import os
import re
import subprocess
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKETS_DIR = os.path.join(BASE, "data", "packets")
OUT_DIR = os.path.join(BASE, "data", "ac-mined")
DEFAULT_AC_ROOT = os.path.normpath(os.path.join(BASE, "..", "references", "mc-client-sources", "anticheats"))
AC_ROOT = os.environ.get("AC_ROOT") or DEFAULT_AC_ROOT

CTX = 4

# MCP packet id -> (Mojang/ProtocolLib 1.8 names, check-domain keywords)
TERMS = {
    "C00Handshake": (["PacketHandshake", "Handshake"], ["proxy", "bungee"]),
    "C00PacketLoginStart": (["PacketLoginInStart", "LoginStart"], []),
    "C00PacketServerQuery": (["PacketStatusInStart", "ServerQuery"], []),
    "C00PacketKeepAlive": (["C00PacketKeepAlive", "PacketPlayInKeepAlive"], ["KeepAlive", "PingSpoof", "Timer"]),
    "C01PacketChatMessage": (["C01PacketChatMessage", "PacketPlayInChat"], ["Chat", "Spammer", "AutoGG"]),
    "C01PacketEncryptionResponse": (["PacketLoginInEncryptionBegin", "Encryption"], []),
    "C01PacketPing": (["PacketStatusInPing"], []),
    "C02PacketUseEntity": (["C02PacketUseEntity", "PacketPlayInUseEntity", "UseEntity"], ["Reach", "KillAura", "Aura", "Angle", "Hitbox"]),
    "C03PacketPlayer": (["C03PacketPlayer", "PacketPlayInFlying", "PacketPlayInPosition", "PacketPlayInPositionLook", "PacketPlayInLook", "PlayerMoveEvent"], ["Move", "Flight", "Speed", "NoFall", "Phase", "Blink", "Step", "Timer", "Ground", "Yaw", "Pitch"]),
    "C07PacketPlayerDigging": (["C07PacketPlayerDigging", "PacketPlayInBlockDig", "BlockDig"], ["Nuker", "FastBreak", "SpeedMine", "Digging", "Break"]),
    "C08PacketPlayerBlockPlacement": (["C08PacketPlayerBlockPlacement", "PacketPlayInBlockPlace", "BlockPlace"], ["Scaffold", "FastPlace", "Place", "BlockPlace"]),
    "C09PacketHeldItemChange": (["C09PacketHeldItemChange", "PacketPlayInHeldItemSlot", "HeldItemSlot"], ["AutoTool", "ItemSwitch", "HeldItem"]),
    "C0APacketAnimation": (["C0APacketAnimation", "PacketPlayInArmAnimation", "ArmAnimation"], ["Swing", "AutoClicker", "Click", "Animation"]),
    "C0BPacketEntityAction": (["C0BPacketEntityAction", "PacketPlayInEntityAction", "EntityAction"], ["Sprint", "Sneak", "WTap", "EntityAction"]),
    "C0CPacketInput": (["C0CPacketInput", "PacketPlayInSteerVehicle", "SteerVehicle"], ["Vehicle", "Boat", "Steer"]),
    "C0DPacketCloseWindow": (["C0DPacketCloseWindow", "PacketPlayInCloseWindow", "CloseWindow"], ["ChestStealer"]),
    "C0EPacketClickWindow": (["C0EPacketClickWindow", "PacketPlayInWindowClick", "WindowClick"], ["Inventory", "ClickWindow", "ChestStealer", "AutoArmor"]),
    "C0FPacketConfirmTransaction": (["C0FPacketConfirmTransaction", "PacketPlayInTransaction", "Transaction"], ["Transaction", "PingSpoof", "Disabler", "Timer"]),
    "C10PacketCreativeInventoryAction": (["C10PacketCreativeInventoryAction", "PacketPlayInCreativeSlot", "CreativeSlot"], ["Creative", "ItemSpoof"]),
    "C11PacketEnchantItem": (["C11PacketEnchantItem", "PacketPlayInEnchantItem"], ["Enchant"]),
    "C12PacketUpdateSign": (["C12PacketUpdateSign", "PacketPlayInUpdateSign"], ["Sign"]),
    "C13PacketPlayerAbilities": (["C13PacketPlayerAbilities", "PacketPlayInAbilities"], ["Abilities", "Fly", "Creative"]),
    "C14PacketTabComplete": (["C14PacketTabComplete", "PacketPlayInTabComplete"], ["TabComplete", "Plugins"]),
    "C15PacketClientSettings": (["C15PacketClientSettings", "PacketPlayInSettings"], ["Settings", "Locale"]),
    "C16PacketClientStatus": (["C16PacketClientStatus", "PacketPlayInClientCommand"], ["ClientCommand", "Respawn", "Inventory"]),
    "C17PacketCustomPayload": (["C17PacketCustomPayload", "PacketPlayInCustomPayload", "CustomPayload"], ["Brand", "Payload", "Register", "FML"]),
    "C18PacketSpectate": (["C18PacketSpectate", "PacketPlayInSpectate"], ["Spectate"]),
    "C19PacketResourcePackStatus": (["C19PacketResourcePackStatus", "PacketPlayInResourcePackStatus"], ["ResourcePack"]),
    "S00PacketDisconnect": (["S00PacketDisconnect", "PacketPlayOutKickDisconnect", "KickDisconnect"], ["Kick", "Disconnect"]),
    "S00PacketKeepAlive": (["S00PacketKeepAlive", "PacketPlayOutKeepAlive"], ["KeepAlive"]),
    "S00PacketServerInfo": (["S00PacketServerInfo", "PacketStatusOutServerInfo"], ["ServerInfo", "MOTD"]),
    "S01PacketEncryptionRequest": (["S01PacketEncryptionRequest", "PacketLoginOutEncryptionBegin"], []),
    "S01PacketJoinGame": (["S01PacketJoinGame", "PacketPlayOutLogin", "JoinGame"], ["JoinGame", "Login"]),
    "S01PacketPong": (["S01PacketPong", "PacketStatusOutPong"], []),
    "S02PacketChat": (["S02PacketChat", "PacketPlayOutChat"], ["Chat", "Staff", "AutoGG", "Ban"]),
    "S02PacketLoginSuccess": (["S02PacketLoginSuccess", "PacketLoginOutSuccess"], []),
    "S03PacketEnableCompression": (["S03PacketEnableCompression", "PacketLoginOutSetCompression"], []),
    "S03PacketTimeUpdate": (["S03PacketTimeUpdate", "PacketPlayOutTimeUpdate"], ["Time"]),
    "S04PacketEntityEquipment": (["S04PacketEntityEquipment", "PacketPlayOutEntityEquipment"], ["Equipment"]),
    "S05PacketSpawnPosition": (["S05PacketSpawnPosition", "PacketPlayOutSpawnPosition"], ["SpawnPosition"]),
    "S06PacketUpdateHealth": (["S06PacketUpdateHealth", "PacketPlayOutUpdateHealth"], ["Health", "Regen"]),
    "S07PacketRespawn": (["S07PacketRespawn", "PacketPlayOutRespawn"], ["Respawn"]),
    "S08PacketPlayerPosLook": (["S08PacketPlayerPosLook", "PacketPlayOutPosition", "PosLook"], ["Teleport", "Position", "NoRotate", "Phase"]),
    "S09PacketHeldItemChange": (["S09PacketHeldItemChange", "PacketPlayOutHeldItemSlot"], ["HeldItem"]),
    "S0APacketUseBed": (["S0APacketUseBed", "PacketPlayOutBed"], []),
    "S0BPacketAnimation": (["S0BPacketAnimation", "PacketPlayOutAnimation"], ["Animation", "Swing"]),
    "S0CPacketSpawnPlayer": (["S0CPacketSpawnPlayer", "PacketPlayOutNamedEntitySpawn"], ["Spawn"]),
    "S0DPacketCollectItem": (["S0DPacketCollectItem", "PacketPlayOutCollect"], []),
    "S0EPacketSpawnObject": (["S0EPacketSpawnObject", "PacketPlayOutSpawnEntity"], ["Spawn"]),
    "S0FPacketSpawnMob": (["S0FPacketSpawnMob", "PacketPlayOutSpawnEntityLiving"], ["Spawn"]),
    "S10PacketSpawnPainting": (["S10PacketSpawnPainting", "PacketPlayOutSpawnEntityPainting"], []),
    "S11PacketSpawnExperienceOrb": (["S11PacketSpawnExperienceOrb", "PacketPlayOutSpawnEntityExperienceOrb"], []),
    "S12PacketEntityVelocity": (["S12PacketEntityVelocity", "PacketPlayOutEntityVelocity"], ["Velocity", "Knockback"]),
    "S13PacketDestroyEntities": (["S13PacketDestroyEntities", "PacketPlayOutEntityDestroy"], ["Destroy", "Despawn"]),
    "S14PacketEntity": (["S14PacketEntity", "PacketPlayOutEntity"], ["EntityMove", "RelEntityMove"]),
    "S18PacketEntityTeleport": (["S18PacketEntityTeleport", "PacketPlayOutEntityTeleport"], ["Teleport"]),
    "S19PacketEntityHeadLook": (["S19PacketEntityHeadLook", "PacketPlayOutEntityHeadRotation"], []),
    "S19PacketEntityStatus": (["S19PacketEntityStatus", "PacketPlayOutEntityStatus"], []),
    "S1BPacketEntityAttach": (["S1BPacketEntityAttach", "PacketPlayOutAttachEntity"], ["Attach"]),
    "S1CPacketEntityMetadata": (["S1CPacketEntityMetadata", "PacketPlayOutEntityMetadata"], ["Metadata", "Invisibility"]),
    "S1DPacketEntityEffect": (["S1DPacketEntityEffect", "PacketPlayOutEntityEffect"], ["Effect", "Potion"]),
    "S1EPacketRemoveEntityEffect": (["S1EPacketRemoveEntityEffect", "PacketPlayOutRemoveEntityEffect"], ["Effect"]),
    "S1FPacketSetExperience": (["S1FPacketSetExperience", "PacketPlayOutExperience"], ["Experience"]),
    "S20PacketEntityProperties": (["S20PacketEntityProperties", "PacketPlayOutEntityProperties"], ["Attribute", "KnockbackResistance"]),
    "S21PacketChunkData": (["S21PacketChunkData", "PacketPlayOutMapChunk", "MapChunk"], ["Chunk", "XRay"]),
    "S22PacketMultiBlockChange": (["S22PacketMultiBlockChange", "PacketPlayOutMultiBlockChange"], ["BlockChange"]),
    "S23PacketBlockChange": (["S23PacketBlockChange", "PacketPlayOutBlockChange"], ["BlockChange"]),
    "S24PacketBlockAction": (["S24PacketBlockAction", "PacketPlayOutBlockAction"], []),
    "S25PacketBlockBreakAnim": (["S25PacketBlockBreakAnim", "PacketPlayOutBlockBreakAnimation"], []),
    "S26PacketMapChunkBulk": (["S26PacketMapChunkBulk", "PacketPlayOutMapChunkBulk"], ["Chunk"]),
    "S27PacketExplosion": (["S27PacketExplosion", "PacketPlayOutExplosion"], ["Explosion", "Velocity"]),
    "S28PacketEffect": (["S28PacketEffect", "PacketPlayOutWorldEvent"], ["Effect"]),
    "S29PacketSoundEffect": (["S29PacketSoundEffect", "PacketPlayOutNamedSoundEffect"], ["Sound"]),
    "S2APacketParticles": (["S2APacketParticles", "PacketPlayOutWorldParticles"], ["Particle"]),
    "S2BPacketChangeGameState": (["S2BPacketChangeGameState", "PacketPlayOutGameStateChange"], ["GameState"]),
    "S2CPacketSpawnGlobalEntity": (["S2CPacketSpawnGlobalEntity", "PacketPlayOutSpawnEntityWeather"], ["Lightning"]),
    "S2DPacketOpenWindow": (["S2DPacketOpenWindow", "PacketPlayOutOpenWindow"], ["Window", "Chest"]),
    "S2EPacketCloseWindow": (["S2EPacketCloseWindow", "PacketPlayOutCloseWindow"], ["Window"]),
    "S2FPacketSetSlot": (["S2FPacketSetSlot", "PacketPlayOutSetSlot"], ["Slot", "Inventory"]),
    "S30PacketWindowItems": (["S30PacketWindowItems", "PacketPlayOutWindowItems"], ["Inventory", "Window"]),
    "S31PacketWindowProperty": (["S31PacketWindowProperty", "PacketPlayOutWindowProperty"], []),
    "S32PacketConfirmTransaction": (["S32PacketConfirmTransaction", "PacketPlayOutTransaction"], ["Transaction"]),
    "S33PacketUpdateSign": (["S33PacketUpdateSign", "PacketPlayOutUpdateSign"], ["Sign"]),
    "S34PacketMaps": (["S34PacketMaps", "PacketPlayOutMap"], []),
    "S35PacketUpdateTileEntity": (["S35PacketUpdateTileEntity", "PacketPlayOutTileEntityData"], ["TileEntity"]),
    "S36PacketSignEditorOpen": (["S36PacketSignEditorOpen", "PacketPlayOutSignEditorOpen"], []),
    "S37PacketStatistics": (["S37PacketStatistics", "PacketPlayOutStatistic"], ["Statistic"]),
    "S38PacketPlayerListItem": (["S38PacketPlayerListItem", "PacketPlayOutPlayerInfo"], ["PlayerInfo", "Tab", "Vanish"]),
    "S39PacketPlayerAbilities": (["S39PacketPlayerAbilities", "PacketPlayOutAbilities"], ["Abilities", "Fly"]),
    "S3APacketTabComplete": (["S3APacketTabComplete", "PacketPlayOutTabComplete"], ["TabComplete"]),
    "S3BPacketScoreboardObjective": (["S3BPacketScoreboardObjective", "PacketPlayOutScoreboardObjective"], ["Scoreboard"]),
    "S3CPacketUpdateScore": (["S3CPacketUpdateScore", "PacketPlayOutScoreboardScore"], ["Scoreboard"]),
    "S3DPacketDisplayScoreboard": (["S3DPacketDisplayScoreboard", "PacketPlayOutScoreboardDisplayObjective"], []),
    "S3EPacketTeams": (["S3EPacketTeams", "PacketPlayOutScoreboardTeam"], ["Team", "Scoreboard"]),
    "S3FPacketCustomPayload": (["S3FPacketCustomPayload", "PacketPlayOutCustomPayload"], ["Brand", "Payload", "FML"]),
    "S40PacketDisconnect": (["S40PacketDisconnect", "PacketPlayOutKickDisconnect"], ["Kick"]),
    "S41PacketServerDifficulty": (["S41PacketServerDifficulty", "PacketPlayOutServerDifficulty"], []),
    "S42PacketCombatEvent": (["S42PacketCombatEvent", "PacketPlayOutCombatEvent"], ["Combat", "Death"]),
    "S43PacketCamera": (["S43PacketCamera", "PacketPlayOutCamera"], ["Camera"]),
    "S44PacketWorldBorder": (["S44PacketWorldBorder", "PacketPlayOutWorldBorder"], ["WorldBorder"]),
    "S45PacketTitle": (["S45PacketTitle", "PacketPlayOutTitle"], ["Title"]),
    "S46PacketSetCompressionLevel": (["S46PacketSetCompressionLevel", "PacketPlayOutSetCompression"], []),
    "S47PacketPlayerListHeaderFooter": (["S47PacketPlayerListHeaderFooter", "PacketPlayOutPlayerListHeaderFooter"], ["Tab"]),
    "S48PacketResourcePackSend": (["S48PacketResourcePackSend", "PacketPlayOutResourcePackSend"], ["ResourcePack"]),
    "S49PacketUpdateEntityNBT": (["S49PacketUpdateEntityNBT", "PacketPlayOutUpdateEntityNBT"], ["NBT"]),
}


def grep_ac(ac_dir, terms):
    hits = {}
    proc = subprocess.run(
        ["grep", "-rn", "-C", str(CTX), "--include=*.java", "--include=*.kt", "--include=*.sk",
         "-E", terms, ac_dir],
        capture_output=True, text=True,
    )
    if proc.returncode not in (0, 1):
        return hits
    current = None
    for raw in proc.stdout.splitlines():
        if raw == "--":
            continue
        m = re.match(r"^(.*):(\d+):(.*)$", raw)
        if not m:
            continue
        rel = os.path.relpath(m.group(1), ac_dir)
        hits.setdefault(rel, []).append((int(m.group(2)), m.group(3)))
    return hits


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    ids = sys.argv[1:] or sorted(f[:-5] for f in os.listdir(PACKETS_DIR) if f.endswith(".json"))
    if not os.path.isdir(AC_ROOT):
        print("ERROR: AC root not found: %s (set AC_ROOT)" % AC_ROOT, file=sys.stderr)
        sys.exit(1)

    acs = sorted(d for d in os.listdir(AC_ROOT) if os.path.isdir(os.path.join(AC_ROOT, d)) and d != "scripts")
    print("anticheats found: %d" % len(acs))

    index_path = os.path.join(OUT_DIR, "_index.json")
    index = json.load(open(index_path)) if os.path.exists(index_path) else {}

    for pkt_id in ids:
        names, domains = TERMS.get(pkt_id, ([pkt_id], []))
        # search pattern: any MCP/Mojang name OR any domain keyword
        terms = "|".join(re.escape(t) for t in names + domains)
        blocks = ["# %s — anticheat corpus (%d anticheats)\n" % (pkt_id, len(acs)),
                  "Ground truth for server-side anti-cheat handling of %s.\n"
                  "Search terms: %s\n" % (pkt_id, ", ".join(names + domains))]
        entry = {}
        for ac in acs:
            ac_dir = os.path.join(AC_ROOT, ac)
            hits = grep_ac(ac_dir, terms)
            if not hits:
                continue
            entry[ac] = sorted(hits.keys())
            blocks.append("\n## %s\n" % ac)
            for rel in sorted(hits.keys()):
                blocks.append("### %s\n```" % rel)
                for lineno, content in hits[rel]:
                    blocks.append("%5d | %s" % (lineno, content))
                blocks.append("```\n")
        with open(os.path.join(OUT_DIR, pkt_id + ".txt"), "w") as f:
            f.write("\n".join(blocks))
        index[pkt_id] = entry
        total = sum(len(v) for v in entry.values())
        print("%-26s %3d files across %d anticheats" % (pkt_id, total, len(entry)))

    with open(index_path, "w") as f:
        json.dump(index, f, indent=1, sort_keys=True)
    print("Wrote %d corpus files to %s" % (len(ids), OUT_DIR))


if __name__ == "__main__":
    main()
