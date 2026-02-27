from django.urls import path

from .views import PlaceSuggestionsView, PlanTripView, debug_mapbox_view

urlpatterns = [
    path("plan/", PlanTripView.as_view(), name="plan_trip"),
    path("places/", PlaceSuggestionsView.as_view(), name="place_suggestions"),
    path("debug/", debug_mapbox_view, name="debug_mapbox"),
]
