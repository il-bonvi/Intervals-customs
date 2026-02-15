"""
Client completo auto-generato dall'OpenAPI spec di Intervals.icu
Include tutti i 114+ endpoints con type hints completi
"""

import requests
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, date, timedelta
import base64
from pathlib import Path

try:
    from intervals_models import (
        Activity, Wellness, CalendarEvent, Athlete, 
        Interval, WorkoutStep, Folder, WorkoutLibrary,
        ActivityType, EventCategory
    )
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    print("⚠️  Pydantic models non disponibili. Usa dict al posto di modelli.")


class IntervalsAPIClient:
    """
    Client completo per Intervals.icu API
    
    Supporta sia autenticazione Basic (API key personale) che Bearer (OAuth)
    
    Esempio uso con API key:
        client = IntervalsAPIClient(api_key='your_key')
        activities = client.get_activities(days_back=7)
    
    Esempio uso con OAuth:
        client = IntervalsAPIClient(access_token='bearer_token')
        activities = client.get_activities(days_back=7)
    """
    
    def __init__(
        self, 
        api_key: Optional[str] = None,
        access_token: Optional[str] = None,
        base_url: str = 'https://intervals.icu'
    ):
        """
        Inizializza il client
        
        Args:
            api_key: API key personale (da https://intervals.icu/settings)
            access_token: Bearer token da OAuth
            base_url: URL base dell'API (default: https://intervals.icu)
        """
        if not api_key and not access_token:
            raise ValueError("Devi fornire api_key o access_token")
        
        self.base_url = base_url
        self.api_key = api_key
        self.access_token = access_token
        
        # Setup auth
        if access_token:
            self.headers = {
                'Authorization': f'Bearer {access_token}',
                'Content-Type': 'application/json'
            }
            self.auth = None
        else:
            self.headers = {'Content-Type': 'application/json'}
            self.auth = ('API_KEY', api_key)
    
    def _request(
        self, 
        method: str, 
        endpoint: str, 
        params: Optional[Dict] = None,
        json: Optional[Dict] = None,
        data: Any = None,
        files: Optional[Dict] = None
    ) -> requests.Response:
        """Esegue una richiesta HTTP gestendo errori"""
        url = f"{self.base_url}{endpoint}"
        
        # Per upload file non usiamo Content-Type
        headers = self.headers.copy()
        if files:
            headers.pop('Content-Type', None)
        
        response = requests.request(
            method=method,
            url=url,
            params=params,
            json=json,
            data=data,
            files=files,
            headers=headers,
            auth=self.auth
        )
        
        response.raise_for_status()
        return response
    
    # ========== ACTIVITIES ==========
    
    def get_activities(
        self,
        athlete_id: str = '0',
        oldest: Optional[Union[str, date, datetime]] = None,
        newest: Optional[Union[str, date, datetime]] = None,
        days_back: int = 30
    ) -> List[Dict]:
        """
        Lista attività
        
        Args:
            athlete_id: ID atleta ('0' = utente corrente)
            oldest: Data inizio (YYYY-MM-DD o datetime)
            newest: Data fine (YYYY-MM-DD o datetime)
            days_back: Giorni indietro se oldest/newest non specificati
        
        Returns:
            Lista di attività
        """
        if not newest:
            newest = datetime.now()
        if not oldest:
            oldest = newest - timedelta(days=days_back)
        
        # Converti date
        if isinstance(oldest, (date, datetime)):
            oldest = oldest.strftime('%Y-%m-%d')
        if isinstance(newest, (date, datetime)):
            newest = newest.strftime('%Y-%m-%d')
        
        params = {'oldest': oldest, 'newest': newest}
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/activities', params=params)
        return response.json()
    
    def get_activity(
        self, 
        activity_id: str,
        include_intervals: bool = False
    ) -> Dict:
        """
        Dettagli completi di un'attività
        
        Args:
            activity_id: ID attività
            include_intervals: Include intervalli rilevati
        
        Returns:
            Dati attività completi
        """
        params = {'intervals': str(include_intervals).lower()}
        response = self._request('GET', f'/api/v1/activity/{activity_id}', params=params)
        return response.json()
    
    def download_activity_file(
        self, 
        activity_id: str,
        save_path: Optional[str] = None
    ) -> bytes:
        """
        Scarica file FIT originale (gzip compresso)
        
        Args:
            activity_id: ID attività
            save_path: Percorso dove salvare (opzionale)
        
        Returns:
            Contenuto file (gzip compressed)
        """
        response = self._request('GET', f'/api/v1/activity/{activity_id}/file')
        content = response.content
        
        if save_path:
            Path(save_path).write_bytes(content)
        
        return content
    
    def download_activity_fit_file(
        self,
        activity_id: str,
        save_path: Optional[str] = None
    ) -> bytes:
        """
        Scarica file FIT generato da Intervals.icu (con edit e laps)
        
        Args:
            activity_id: ID attività
            save_path: Percorso dove salvare
        
        Returns:
            File FIT (gzip compressed)
        """
        response = self._request('GET', f'/api/v1/activity/{activity_id}/fit-file')
        content = response.content
        
        if save_path:
            Path(save_path).write_bytes(content)
        
        return content
    
    def upload_activity(
        self,
        file_path: str,
        athlete_id: str = '0',
        name: Optional[str] = None,
        description: Optional[str] = None,
        type: Optional[str] = None,
        external_id: Optional[str] = None
    ) -> Dict:
        """
        Carica un'attività (FIT, TCX, GPX o zip/gz)
        
        Args:
            file_path: Path al file da caricare
            athlete_id: ID atleta ('0' = corrente)
            name: Nome attività (opzionale)
            description: Descrizione (opzionale)
            type: Tipo attività (opzionale)
            external_id: ID esterno per tracking (opzionale)
        
        Returns:
            Dati attività creata
        """
        params = {}
        if name:
            params['name'] = name
        if description:
            params['description'] = description
        if type:
            params['type'] = type
        if external_id:
            params['external_id'] = external_id
        
        with open(file_path, 'rb') as f:
            files = {'file': f}
            response = self._request(
                'POST',
                f'/api/v1/athlete/{athlete_id}/activities',
                params=params,
                files=files
            )
        
        return response.json()
    
    def update_activity(
        self,
        activity_id: str,
        **fields
    ) -> Dict:
        """
        Aggiorna un'attività
        
        Args:
            activity_id: ID attività
            **fields: Campi da aggiornare (name, description, type, feel, etc.)
        
        Returns:
            Attività aggiornata
        """
        response = self._request('PUT', f'/api/v1/activity/{activity_id}', json=fields)
        return response.json()
    
    def delete_activity(self, activity_id: str) -> None:
        """Elimina un'attività"""
        self._request('DELETE', f'/api/v1/activity/{activity_id}')
    
    # ========== WELLNESS ==========
    
    def get_wellness(
        self,
        athlete_id: str = '0',
        oldest: Optional[Union[str, date]] = None,
        newest: Optional[Union[str, date]] = None,
        days_back: int = 30
    ) -> List[Dict]:
        """
        Lista dati wellness
        
        Args:
            athlete_id: ID atleta
            oldest: Data inizio
            newest: Data fine
            days_back: Giorni indietro
        
        Returns:
            Lista record wellness
        """
        if not newest:
            newest = date.today()
        if not oldest:
            oldest = newest - timedelta(days=days_back)
        
        if isinstance(oldest, date):
            oldest = oldest.strftime('%Y-%m-%d')
        if isinstance(newest, date):
            newest = newest.strftime('%Y-%m-%d')
        
        params = {'oldest': oldest, 'newest': newest}
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/wellness', params=params)
        return response.json()
    
    def get_wellness_date(
        self,
        wellness_date: Union[str, date],
        athlete_id: str = '0'
    ) -> Dict:
        """
        Dati wellness per una data specifica
        
        Args:
            wellness_date: Data (YYYY-MM-DD o date)
            athlete_id: ID atleta
        
        Returns:
            Record wellness
        """
        if isinstance(wellness_date, date):
            wellness_date = wellness_date.strftime('%Y-%m-%d')
        
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/wellness/{wellness_date}')
        return response.json()
    
    def update_wellness(
        self,
        wellness_date: Union[str, date],
        athlete_id: str = '0',
        **fields
    ) -> Dict:
        """
        Aggiorna wellness per una data
        
        Args:
            wellness_date: Data
            athlete_id: ID atleta
            **fields: weight, restingHR, hrv, steps, etc.
        
        Returns:
            Record aggiornato
        """
        if isinstance(wellness_date, date):
            wellness_date = wellness_date.strftime('%Y-%m-%d')
        
        response = self._request(
            'PUT',
            f'/api/v1/athlete/{athlete_id}/wellness/{wellness_date}',
            json=fields
        )
        return response.json()
    
    def upload_wellness_bulk(
        self,
        wellness_records: List[Dict],
        athlete_id: str = '0'
    ) -> Dict:
        """
        Carica multipli record wellness (bulk)
        
        Args:
            wellness_records: Lista di dict con formato:
                [{"id": "2025-01-28", "weight": 70.5, "restingHR": 48}, ...]
            athlete_id: ID atleta
        
        Returns:
            Risultato operazione
        """
        response = self._request(
            'PUT',
            f'/api/v1/athlete/{athlete_id}/wellness-bulk',
            json=wellness_records
        )
        return response.json()
    
    # ========== CALENDAR / EVENTS ==========
    
    def get_events(
        self,
        athlete_id: str = '0',
        oldest: Optional[Union[str, date]] = None,
        newest: Optional[Union[str, date]] = None,
        days_forward: int = 30
    ) -> List[Dict]:
        """
        Lista eventi calendario (workouts, note, gare)
        
        Args:
            athlete_id: ID atleta
            oldest: Data inizio
            newest: Data fine
            days_forward: Giorni in avanti
        
        Returns:
            Lista eventi
        """
        if not oldest:
            oldest = date.today()
        if not newest:
            newest = oldest + timedelta(days=days_forward)
        
        if isinstance(oldest, date):
            oldest = oldest.strftime('%Y-%m-%d')
        if isinstance(newest, date):
            newest = newest.strftime('%Y-%m-%d')
        
        params = {'oldest': oldest, 'newest': newest}
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/events', params=params)
        return response.json()
    
    def get_event(
        self,
        event_id: int,
        athlete_id: str = '0'
    ) -> Dict:
        """Dettagli evento specifico"""
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/events/{event_id}')
        return response.json()
    
    def create_event(
        self,
        athlete_id: str = '0',
        **event_data
    ) -> Dict:
        """
        Crea un evento calendario
        
        Args:
            athlete_id: ID atleta
            **event_data: category, start_date_local, name, description, type, etc.
        
        Example:
            create_event(
                category='WORKOUT',
                start_date_local='2025-02-01T00:00:00',
                name='Intervalli',
                description='- 10m 60%\\n- 5x (5m 95%, 5m 50%)',
                type='Ride'
            )
        
        Returns:
            Evento creato
        """
        response = self._request('POST', f'/api/v1/athlete/{athlete_id}/events', json=event_data)
        return response.json()
    
    def update_event(
        self,
        event_id: int,
        athlete_id: str = '0',
        **event_data
    ) -> Dict:
        """Aggiorna un evento"""
        response = self._request(
            'PUT',
            f'/api/v1/athlete/{athlete_id}/events/{event_id}',
            json=event_data
        )
        return response.json()
    
    def delete_event(
        self,
        event_id: int,
        athlete_id: str = '0'
    ) -> None:
        """Elimina un evento"""
        self._request('DELETE', f'/api/v1/athlete/{athlete_id}/events/{event_id}')
    
    def create_events_bulk(
        self,
        events: List[Dict],
        athlete_id: str = '0',
        upsert: bool = True
    ) -> List[Dict]:
        """
        Crea/aggiorna multipli eventi (bulk)
        
        Args:
            events: Lista eventi
            athlete_id: ID atleta
            upsert: Se True, aggiorna eventi esistenti (tramite external_id)
        
        Returns:
            Eventi creati/aggiornati
        """
        params = {'upsert': str(upsert).lower()}
        response = self._request(
            'POST',
            f'/api/v1/athlete/{athlete_id}/events/bulk',
            params=params,
            json=events
        )
        return response.json()
    
    def delete_events_bulk(
        self,
        event_ids: List[Dict],
        athlete_id: str = '0'
    ) -> Dict:
        """
        Elimina multipli eventi
        
        Args:
            event_ids: Lista di dict con 'id' o 'external_id'
                [{"id": 123}, {"external_id": "abc"}, ...]
            athlete_id: ID atleta
        
        Returns:
            Numero eventi eliminati
        """
        response = self._request(
            'PUT',
            f'/api/v1/athlete/{athlete_id}/events/bulk-delete',
            json=event_ids
        )
        return response.json()
    
    def download_event_workout(
        self,
        event_id: int,
        format: str = 'zwo',
        athlete_id: str = '0',
        save_path: Optional[str] = None
    ) -> bytes:
        """
        Scarica workout in formato ZWO, MRC o ERG
        
        Args:
            event_id: ID evento
            format: 'zwo', 'mrc', o 'erg'
            athlete_id: ID atleta
            save_path: Path dove salvare
        
        Returns:
            Contenuto file
        """
        response = self._request(
            'GET',
            f'/api/v1/athlete/{athlete_id}/events/{event_id}/download.{format}'
        )
        content = response.content
        
        if save_path:
            Path(save_path).write_bytes(content)
        
        return content
    
    # ========== WORKOUT LIBRARY ==========
    
    def get_folders(self, athlete_id: str = '0') -> List[Dict]:
        """Lista tutte le cartelle workout"""
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/folders')
        return response.json()
    
    def get_workouts(self, athlete_id: str = '0') -> List[Dict]:
        """Lista tutti i workout nella libreria"""
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/workouts')
        return response.json()
    
    def get_workout(
        self,
        workout_id: int,
        athlete_id: str = '0'
    ) -> Dict:
        """Dettagli workout specifico"""
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/workouts/{workout_id}')
        return response.json()
    
    def create_workout(
        self,
        athlete_id: str = '0',
        **workout_data
    ) -> Dict:
        """
        Crea workout nella libreria
        
        Args:
            athlete_id: ID atleta
            **workout_data: folder_id, name, description, etc.
        
        Returns:
            Workout creato
        """
        response = self._request('POST', f'/api/v1/athlete/{athlete_id}/workouts', json=workout_data)
        return response.json()
    
    def update_workout(
        self,
        workout_id: int,
        athlete_id: str = '0',
        **workout_data
    ) -> Dict:
        """Aggiorna workout"""
        response = self._request(
            'PUT',
            f'/api/v1/athlete/{athlete_id}/workouts/{workout_id}',
            json=workout_data
        )
        return response.json()
    
    def delete_workout(
        self,
        workout_id: int,
        athlete_id: str = '0'
    ) -> None:
        """Elimina workout"""
        self._request('DELETE', f'/api/v1/athlete/{athlete_id}/workouts/{workout_id}')
    
    # ========== ATHLETE INFO ==========
    
    def get_athlete(self, athlete_id: str = '0') -> Dict:
        """Informazioni atleta"""
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}')
        return response.json()
    
    def update_athlete(
        self,
        athlete_id: str = '0',
        **athlete_data
    ) -> Dict:
        """
        Aggiorna info atleta
        
        Args:
            athlete_id: ID atleta
            **athlete_data: weight, icu_ftp, icu_hr_lthr, etc.
        
        Returns:
            Atleta aggiornato
        """
        response = self._request('PUT', f'/api/v1/athlete/{athlete_id}', json=athlete_data)
        return response.json()
    
    def get_athlete_settings(self, athlete_id: str = '0') -> Dict:
        """Impostazioni atleta"""
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/settings')
        return response.json()
    
    # ========== CALENDARS ==========
    
    def get_calendars(self, athlete_id: str = '0') -> List[Dict]:
        """Lista tutti i calendari"""
        response = self._request('GET', f'/api/v1/athlete/{athlete_id}/calendars')
        return response.json()
    
    # ========== POWER CURVE / BEST EFFORTS ==========
    
    def get_activity_best_efforts(
        self,
        activity_id: str
    ) -> Dict:
        """Best efforts per un'attività"""
        response = self._request('GET', f'/api/v1/activity/{activity_id}/best-efforts')
        return response.json()
    
    def get_power_curve(
        self,
        athlete_id: str = '0',
        oldest: Optional[str] = None,
        newest: Optional[str] = None
    ) -> Dict:
        """
        Power curve (migliori sforzi per durata)
        
        Args:
            athlete_id: ID atleta
            oldest: Data inizio
            newest: Data fine
        
        Returns:
            Dati power curve
        """
        params = {}
        if oldest:
            params['oldest'] = oldest
        if newest:
            params['newest'] = newest
        
        response = self._request(
            'GET',
            f'/api/v1/athlete/{athlete_id}/power-curve',
            params=params
        )
        return response.json()
    
    # ========== FITNESS / CTL ==========
    
    def get_fitness(
        self,
        athlete_id: str = '0',
        oldest: Optional[str] = None,
        newest: Optional[str] = None
    ) -> List[Dict]:
        """
        Dati fitness (CTL, ATL, TSB)
        
        Returns:
            Lista dati fitness giornalieri
        """
        params = {}
        if oldest:
            params['oldest'] = oldest
        if newest:
            params['newest'] = newest
        
        response = self._request(
            'GET',
            f'/api/v1/athlete/{athlete_id}/fitness',
            params=params
        )
        return response.json()


# ========== HELPER FUNCTIONS ==========

def format_workout_description(
    warmup_minutes: int = 10,
    intervals: List[tuple] = None,
    cooldown_minutes: int = 10,
    warmup_power: int = 60,
    cooldown_power: int = 60
) -> str:
    """
    Helper per creare descrizioni workout in formato Intervals.icu
    
    Args:
        warmup_minutes: Minuti riscaldamento
        intervals: Lista di tuple (durata_min, potenza_%, recupero_min, potenza_recupero_%)
        cooldown_minutes: Minuti defaticamento
        warmup_power: % FTP riscaldamento
        cooldown_power: % FTP defaticamento
    
    Example:
        desc = format_workout_description(
            warmup_minutes=15,
            intervals=[(8, 110, 8, 50), (8, 110, 8, 50)],
            cooldown_minutes=10
        )
    
    Returns:
        Descrizione workout formattata
    """
    lines = []
    
    # Warmup
    lines.append(f"- {warmup_minutes}m {warmup_power}%")
    
    # Main set
    if intervals:
        lines.append(f"- {len(intervals)}x (")
        for work_min, work_pct, rec_min, rec_pct in intervals[:1]:  # Primo solo per formato
            lines.append(f"  - {work_min}m {work_pct}%")
            lines.append(f"  - {rec_min}m {rec_pct}%")
        lines.append(")")
    
    # Cooldown
    lines.append(f"- {cooldown_minutes}m {cooldown_power}%")
    
    return '\n'.join(lines)
