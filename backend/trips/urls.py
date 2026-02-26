from django.urls import path

from .views import PlaceSuggestionsView, PlanTripView

urlpatterns = [
    path("plan/", PlanTripView.as_view(), name="plan_trip"),
    path("places/", PlaceSuggestionsView.as_view(), name="place_suggestions"),
]
