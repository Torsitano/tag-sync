import { EC2Client, Instance, Tag, Volume } from '@aws-sdk/client-ec2'
import { OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE } from './main'
import { applyTagsToResources } from './tagUtils'


export async function applyInstanceTagsToVolumes( ec2Client: EC2Client, instance: Instance, volumes: Map<string, Volume>, isDryRun: boolean ) {
    if ( !instance.Tags ) {
        console.log( `Instance '${instance.InstanceId}' has no tags, skipping` )
        return
    }

    for ( const mapping of instance.BlockDeviceMappings || [] ) {

        const volumeId = mapping.Ebs!.VolumeId!
        const volume = volumes.get( volumeId )

        // It should be impossible to run into this, but just in case
        if ( !volume ) {
            console.warn( `Volume '${volumeId}' not found for instance '${instance.InstanceId}'` )
            continue
        }

        const tagsToApply: Tag[] = []

        for ( const tag of instance.Tags ) {

            // Skip the "Name" tag/variations of it, which is not needed
            if ( tag.Key!.toLowerCase() === 'name' ) {
                continue
            }

            const existingVolumeTag = volume.Tags?.find( vTag => vTag.Key === tag.Key )

            if ( !existingVolumeTag ) {
                // If the tag is not on the volume, we add it to the tags to apply
                console.log( `Adding tag '${tag.Key}' on volume '${volumeId}' from instance '${instance.InstanceId}'` )
                tagsToApply.push( {
                    Key: tag.Key,
                    Value: tag.Value,
                } )
            } else if ( OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE && existingVolumeTag.Value !== tag.Value ) {
                // If the tag is on the volume but has a different value, we overwrite it if overwrite is true
                console.log( `Overwriting tag '${tag.Key}' on volume '${volumeId}' from instance '${instance.InstanceId}'` )
                tagsToApply.push( {
                    Key: tag.Key,
                    Value: tag.Value,
                } )
            } else if ( !OVERWRITE_TAGS_ON_VOLUME_FROM_INSTANCE && existingVolumeTag.Value !== tag.Value ) {
                // If the tag is different and we are not overwriting, we skip it
                console.log( `Skipping tag '${tag.Key}' on volume '${volumeId}' from instance '${instance.InstanceId}' because it already exists with a different value and overwrite is false` )
            }

        }

        await applyTagsToResources( {
            ec2Client,
            resourceIds: [ volumeId ],
            tags: tagsToApply,
            isDryRun: isDryRun,
            resourceType: 'volume',
            resourceName: volumeId
        } )
    }
}