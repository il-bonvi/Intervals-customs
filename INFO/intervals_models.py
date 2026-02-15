"""
Modelli auto-generati dall'OpenAPI spec di Intervals.icu
Usa questi modelli per type checking e validazione automatica
"""

from typing import Optional, List, Dict, Any, Union
from datetime import datetime, date
from pydantic import BaseModel, Field
from enum import Enum



class ActivityType(str, Enum):
    """Tipi di attività supportati"""
    RIDE = "Ride"
    RUN = "Run"
    SWIM = "Swim"
    WEIGHT_TRAINING = "WeightTraining"
    WALK = "Walk"
    HIKE = "Hike"
    ALPINE_SKI = "AlpineSki"
    BACKCOUNTRY_SKI = "BackcountrySki"
    ROWING = "Rowing"
    ELLIPTICAL = "Elliptical"
    YOGA = "Yoga"
    OTHER = "Other"


class EventCategory(str, Enum):
    """Categorie di eventi calendario"""
    WORKOUT = "WORKOUT"
    NOTE = "NOTE"
    PLAN = "PLAN"
    RACE = "RACE"



class Activity(BaseModel):
    """Attività completata"""
    id: str
    start_date_local: datetime
    type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    distance: Optional[float] = None
    moving_time: Optional[int] = None
    elapsed_time: Optional[int] = None
    total_elevation_gain: Optional[float] = None
    average_watts: Optional[float] = None
    normalized_watts: Optional[float] = None
    average_heartrate: Optional[float] = None
    max_heartrate: Optional[float] = None
    average_cadence: Optional[float] = None
    average_speed: Optional[float] = None
    max_speed: Optional[float] = None
    calories: Optional[float] = None
    icu_training_load: Optional[float] = None
    icu_intensity: Optional[float] = None
    icu_efficiency_factor: Optional[float] = None
    icu_power_hr_z_score: Optional[float] = None
    feel: Optional[int] = None
    perceived_exertion: Optional[int] = None
    ignore_time: Optional[bool] = None
    ignore_hr: Optional[bool] = None
    ignore_power: Optional[bool] = None
    external_id: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class Wellness(BaseModel):
    """Dati wellness giornalieri"""
    id: str  # YYYY-MM-DD
    weight: Optional[float] = None
    restingHR: Optional[int] = Field(None, alias='resting_hr')
    hrv: Optional[float] = None
    rhr: Optional[float] = None
    steps: Optional[int] = None
    soreness: Optional[int] = None
    fatigue: Optional[int] = None
    stress: Optional[int] = None
    mood: Optional[int] = None
    motivation: Optional[int] = None
    injury: Optional[int] = None
    menstruation: Optional[bool] = None
    kcal: Optional[int] = None
    sleepSecs: Optional[int] = Field(None, alias='sleep_secs')
    sleepScore: Optional[int] = Field(None, alias='sleep_score')
    avgSleepingHR: Optional[float] = Field(None, alias='avg_sleeping_hr')
    locked: Optional[bool] = False
    
    class Config:
        populate_by_name = True


class CalendarEvent(BaseModel):
    """Evento calendario (workout, nota, gara)"""
    id: Optional[int] = None
    start_date_local: str  # YYYY-MM-DDTHH:MM:SS
    end_date_local: Optional[str] = None
    category: EventCategory
    name: Optional[str] = None
    description: Optional[str] = None
    type: Optional[str] = None
    color: Optional[str] = None
    moving_time: Optional[int] = None
    distance: Optional[float] = None
    icu_training_load: Optional[float] = None
    icu_intensity: Optional[float] = None
    external_id: Optional[str] = None
    workout_doc: Optional[Dict[str, Any]] = None
    filename: Optional[str] = None
    file_contents: Optional[str] = None
    file_contents_base64: Optional[str] = None


class Athlete(BaseModel):
    """Info atleta"""
    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    created: Optional[datetime] = None
    icu_ftp: Optional[int] = None
    icu_w_prime: Optional[int] = None
    icu_ftp_date: Optional[date] = None
    icu_hr_lthr: Optional[int] = None
    icu_hr_resting: Optional[int] = None
    icu_run_threshold_pace: Optional[float] = None
    icu_swim_threshold_pace: Optional[float] = None
    weight: Optional[float] = None
    dob: Optional[date] = None
    sex: Optional[str] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat(),
            date: lambda v: v.isoformat()
        }


class Interval(BaseModel):
    """Intervallo rilevato in un'attività"""
    id: int
    type: str
    start_index: int
    end_index: int
    start_time: Optional[int] = None
    end_time: Optional[int] = None
    moving_time: int
    distance: Optional[float] = None
    average_watts: Optional[float] = None
    normalized_watts: Optional[float] = None
    average_heartrate: Optional[float] = None
    average_cadence: Optional[float] = None
    average_speed: Optional[float] = None
    training_load: Optional[float] = None
    intensity: Optional[float] = None


class WorkoutStep(BaseModel):
    """Step di un workout"""
    duration: Optional[int] = None
    power: Optional[Dict[str, Any]] = None
    cadence: Optional[Dict[str, Any]] = None
    text: Optional[str] = None
    reps: Optional[int] = None
    steps: Optional[List['WorkoutStep']] = None
    
WorkoutStep.update_forward_refs()


class Folder(BaseModel):
    """Cartella workout library"""
    id: int
    name: str
    shared_with_athlete_ids: Optional[List[str]] = None


class WorkoutLibrary(BaseModel):
    """Workout nella libreria"""
    id: int
    folder_id: int
    name: str
    description: Optional[str] = None
    workout_doc: Optional[Dict[str, Any]] = None
