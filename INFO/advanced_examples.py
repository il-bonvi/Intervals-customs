"""
Esempi avanzati usando il client completo auto-generato
"""

from intervals_client import IntervalsAPIClient, format_workout_description
from datetime import datetime, timedelta, date
import os
from dotenv import load_dotenv

load_dotenv()


def example_1_complete_activity_sync():
    """Sincronizzazione completa attività con download FIT files"""
    
    api_key = os.environ.get('INTERVALS_API_KEY')
    client = IntervalsAPIClient(api_key=api_key)
    
    print("\n=== ESEMPIO 1: Sincronizzazione completa attività ===\n")
    
    # Scarica attività ultime 2 settimane
    activities = client.get_activities(days_back=14)
    print(f"📥 Trovate {len(activities)} attività")
    
    # Per ogni attività, scarica dettagli completi con intervalli
    for activity in activities[:3]:  # Prime 3
        activity_id = activity['id']
        
        # Dettagli completi
        details = client.get_activity(activity_id, include_intervals=True)
        
        print(f"\n🏃 {details['name']}")
        print(f"   Data: {details['start_date_local']}")
        print(f"   Tipo: {details['type']}")
        print(f"   Distanza: {details.get('distance', 0)/1000:.1f} km")
        print(f"   Training Load: {details.get('icu_training_load', 0):.0f}")
        print(f"   Intensità: {details.get('icu_intensity', 0):.0f}")
        
        # Intervalli
        if 'icu_intervals' in details:
            intervals = details['icu_intervals']
            work_intervals = [i for i in intervals if i.get('type') == 'WORK']
            print(f"   Intervalli lavoro: {len(work_intervals)}")
            
            for idx, interval in enumerate(work_intervals[:3], 1):
                print(f"     #{idx}: {interval.get('moving_time')}s @ "
                      f"{interval.get('average_watts')}W "
                      f"({interval.get('average_heartrate')} bpm)")
        
        # Scarica file FIT originale
        fit_path = f"downloads/activity_{activity_id}.fit.gz"
        os.makedirs('downloads', exist_ok=True)
        client.download_activity_file(activity_id, fit_path)
        print(f"   💾 File salvato: {fit_path}")


def example_2_create_training_week():
    """Crea una settimana di allenamenti pianificati"""
    
    api_key = os.environ.get('INTERVALS_API_KEY')
    client = IntervalsAPIClient(api_key=api_key)
    
    print("\n=== ESEMPIO 2: Creazione settimana di allenamenti ===\n")
    
    # Inizia lunedì prossimo
    today = date.today()
    days_ahead = 7 - today.weekday()  # Lunedì prossimo
    monday = today + timedelta(days=days_ahead)
    
    # Piano settimanale
    weekly_plan = [
        {
            'day': 0,  # Lunedì
            'name': 'Endurance Base',
            'description': '- 60m 65%',
            'type': 'Ride'
        },
        {
            'day': 2,  # Mercoledì
            'name': 'VO2 Max Intervals',
            'description': format_workout_description(
                warmup_minutes=15,
                intervals=[(5, 120, 5, 50)] * 4,  # 4x (5min@120%, 5min@50%)
                cooldown_minutes=10
            ),
            'type': 'Ride'
        },
        {
            'day': 4,  # Venerdì
            'name': 'Threshold Repeats',
            'description': format_workout_description(
                warmup_minutes=20,
                intervals=[(10, 95, 5, 60)] * 3,  # 3x (10min@95%, 5min@60%)
                cooldown_minutes=15
            ),
            'type': 'Ride'
        },
        {
            'day': 5,  # Sabato
            'name': 'Long Ride',
            'description': '- 180m 70%',
            'type': 'Ride'
        }
    ]
    
    # Crea gli eventi
    events = []
    for workout in weekly_plan:
        workout_date = monday + timedelta(days=workout['day'])
        
        event = client.create_event(
            category='WORKOUT',
            start_date_local=workout_date.strftime('%Y-%m-%dT00:00:00'),
            name=workout['name'],
            description=workout['description'],
            type=workout['type']
        )
        
        events.append(event)
        print(f"✅ Creato: {workout['name']} per {workout_date.strftime('%A %d/%m')}")
    
    print(f"\n📅 Settimana di allenamento creata! ({len(events)} workout)")


def example_3_wellness_tracking():
    """Tracking completo dati wellness"""
    
    api_key = os.environ.get('INTERVALS_API_KEY')
    client = IntervalsAPIClient(api_key=api_key)
    
    print("\n=== ESEMPIO 3: Tracking Wellness ===\n")
    
    # Carica dati wellness ultimi 7 giorni (simulati)
    wellness_data = []
    
    for i in range(7):
        day = date.today() - timedelta(days=i)
        
        # Simula dati (in produzione questi vengono da bilancia/smartwatch)
        wellness_data.append({
            'id': day.strftime('%Y-%m-%d'),
            'weight': 70.0 + (i * 0.1),  # Variazione peso
            'restingHR': 48 + (i % 3),   # HR a riposo
            'hrv': 85.0 - (i * 0.5),     # HRV
            'steps': 10000 - (i * 500),   # Passi
            'soreness': min(i, 5),        # Dolore muscolare (1-10)
            'fatigue': min(i, 5),         # Fatica (1-10)
            'mood': 8 - (i % 3),          # Umore (1-10)
            'motivation': 9 - (i % 2)     # Motivazione (1-10)
        })
    
    # Upload bulk
    result = client.upload_wellness_bulk(wellness_data)
    print(f"✅ {len(wellness_data)} record wellness caricati")
    
    # Scarica e analizza
    wellness = client.get_wellness(days_back=7)
    
    print("\n📊 Analisi wellness ultimi 7 giorni:")
    
    # Calcola medie
    weights = [w.get('weight') for w in wellness if w.get('weight')]
    hrs = [w.get('restingHR') for w in wellness if w.get('restingHR')]
    hrvs = [w.get('hrv') for w in wellness if w.get('hrv')]
    
    if weights:
        print(f"   Peso medio: {sum(weights)/len(weights):.1f} kg")
    if hrs:
        print(f"   HR riposo media: {sum(hrs)/len(hrs):.0f} bpm")
    if hrvs:
        print(f"   HRV media: {sum(hrvs)/len(hrvs):.1f} ms")
    
    # Trend
    if len(weights) >= 2:
        trend = "📈 in aumento" if weights[0] > weights[-1] else "📉 in diminuzione"
        print(f"   Trend peso: {trend}")


def example_4_bulk_workout_library():
    """Gestione libreria workout con creazione bulk"""
    
    api_key = os.environ.get('INTERVALS_API_KEY')
    client = IntervalsAPIClient(api_key=api_key)
    
    print("\n=== ESEMPIO 4: Libreria Workout ===\n")
    
    # Lista cartelle esistenti
    folders = client.get_folders()
    print(f"📁 Cartelle esistenti: {len(folders)}")
    
    # Usa prima cartella o creane una
    if folders:
        folder_id = folders[0]['id']
        print(f"   Usando cartella: {folders[0]['name']}")
    else:
        print("   Nessuna cartella trovata")
        return
    
    # Workout templates da creare
    workout_templates = [
        {
            'name': 'Sweet Spot 3x10',
            'description': format_workout_description(
                warmup_minutes=15,
                intervals=[(10, 90, 5, 60)] * 3,
                cooldown_minutes=10
            )
        },
        {
            'name': 'VO2 Max 5x5',
            'description': format_workout_description(
                warmup_minutes=15,
                intervals=[(5, 120, 5, 50)] * 5,
                cooldown_minutes=10
            )
        },
        {
            'name': 'Endurance Z2',
            'description': '- 90m 65%'
        }
    ]
    
    # Crea workout nella libreria
    for template in workout_templates:
        workout = client.create_workout(
            folder_id=folder_id,
            name=template['name'],
            description=template['description']
        )
        print(f"✅ Creato workout: {template['name']}")
    
    # Lista tutti i workout
    workouts = client.get_workouts()
    print(f"\n📚 Workout totali in libreria: {len(workouts)}")


def example_5_power_analysis():
    """Analisi power curve e best efforts"""
    
    api_key = os.environ.get('INTERVALS_API_KEY')
    client = IntervalsAPIClient(api_key=api_key)
    
    print("\n=== ESEMPIO 5: Analisi Power Curve ===\n")
    
    # Scarica power curve ultimi 90 giorni
    oldest = (date.today() - timedelta(days=90)).strftime('%Y-%m-%d')
    newest = date.today().strftime('%Y-%m-%d')
    
    power_curve = client.get_power_curve(oldest=oldest, newest=newest)
    
    print("🔋 Power Curve (best efforts):")
    
    # Durate chiave da analizzare (in secondi)
    key_durations = {
        5: '5s (Anaerobic)',
        60: '1min (VO2 Max)',
        300: '5min (VO2 Max)',
        1200: '20min (FTP)',
        3600: '1h (Threshold)'
    }
    
    if 'power' in power_curve:
        for duration_sec, label in key_durations.items():
            if duration_sec < len(power_curve['power']):
                watts = power_curve['power'][duration_sec]
                if watts:
                    print(f"   {label}: {watts:.0f}W")


def example_6_fitness_tracking():
    """Tracking fitness (CTL/ATL/TSB) con trend"""
    
    api_key = os.environ.get('INTERVALS_API_KEY')
    client = IntervalsAPIClient(api_key=api_key)
    
    print("\n=== ESEMPIO 6: Fitness Tracking ===\n")
    
    # Scarica dati fitness ultimi 30 giorni
    oldest = (date.today() - timedelta(days=30)).strftime('%Y-%m-%d')
    newest = date.today().strftime('%Y-%m-%d')
    
    fitness_data = client.get_fitness(oldest=oldest, newest=newest)
    
    if not fitness_data:
        print("Nessun dato fitness disponibile")
        return
    
    # Ultimo dato
    latest = fitness_data[-1]
    
    print("📈 Stato Fitness Attuale:")
    print(f"   CTL (Chronic Training Load): {latest.get('ctl', 0):.0f}")
    print(f"   ATL (Acute Training Load): {latest.get('atl', 0):.0f}")
    print(f"   TSB (Training Stress Balance): {latest.get('tsb', 0):.0f}")
    print(f"   Form: {latest.get('form', 'N/A')}")
    
    # Calcola trend CTL (ultimi 7 vs precedenti 7 giorni)
    if len(fitness_data) >= 14:
        recent_ctl = sum(d.get('ctl', 0) for d in fitness_data[-7:]) / 7
        previous_ctl = sum(d.get('ctl', 0) for d in fitness_data[-14:-7]) / 7
        
        trend = "📈 crescente" if recent_ctl > previous_ctl else "📉 calante"
        change = ((recent_ctl - previous_ctl) / previous_ctl) * 100
        
        print(f"\n   Trend CTL (7 giorni): {trend} ({change:+.1f}%)")
    
    # Raccomandazioni basate su TSB
    tsb = latest.get('tsb', 0)
    if tsb > 20:
        print("\n💡 Raccomandazione: Sei molto riposato, buon momento per un allenamento intenso!")
    elif tsb < -30:
        print("\n⚠️  Raccomandazione: Stanchezza accumulata, considera un periodo di recupero")
    else:
        print("\n✅ Raccomandazione: Bilanciamento buono tra carico e recupero")


def main():
    """Esegue tutti gli esempi"""
    
    api_key = os.environ.get('INTERVALS_API_KEY')
    if not api_key:
        print("⚠️  Configura INTERVALS_API_KEY prima di eseguire gli esempi")
        print("export INTERVALS_API_KEY='tua_chiave'")
        return
    
    print("\n" + "="*60)
    print("ESEMPI AVANZATI - Intervals.icu API Client")
    print("="*60)
    
    # Esegui gli esempi (commenta quelli che non vuoi eseguire)
    
    try:
        example_1_complete_activity_sync()
    except Exception as e:
        print(f"❌ Errore esempio 1: {e}")
    
    try:
        example_2_create_training_week()
    except Exception as e:
        print(f"❌ Errore esempio 2: {e}")
    
    try:
        example_3_wellness_tracking()
    except Exception as e:
        print(f"❌ Errore esempio 3: {e}")
    
    try:
        example_4_bulk_workout_library()
    except Exception as e:
        print(f"❌ Errore esempio 4: {e}")
    
    try:
        example_5_power_analysis()
    except Exception as e:
        print(f"❌ Errore esempio 5: {e}")
    
    try:
        example_6_fitness_tracking()
    except Exception as e:
        print(f"❌ Errore esempio 6: {e}")
    
    print("\n" + "="*60)
    print("✅ Esempi completati!")
    print("="*60 + "\n")


if __name__ == '__main__':
    main()
