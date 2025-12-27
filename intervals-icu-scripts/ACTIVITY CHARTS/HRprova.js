var z5 = icu.activity.hr_zones && icu.activity.hr_zones.z5 ? icu.activity.hr_zones.z5 :
         (Array.isArray(icu.activity.hr_zones) && icu.activity.hr_zones.length > 4 ? icu.activity.hr_zones[4] : 0);
var hrs = icu.streams.get("fixed_heartrate").data;
var times = icu.streams.get("time").data;
var totalTime = 0;
for (var i = 1; i < hrs.length; i++) {
    var dt = times[i] - times[i-1];
    if (dt > 0 && hrs[i] >= z5) {
        totalTime += dt;
    }
}
totalTime / 60;